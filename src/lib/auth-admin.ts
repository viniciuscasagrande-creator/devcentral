import { createVerify } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "devcentral-190fe";
const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null =
  null;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const res = await fetch(GOOGLE_CERTS_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Falha ao buscar certificados públicos do Firebase Auth");
  }
  const certs = (await res.json()) as Record<string, string>;
  cachedCerts = {
    certs,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  return certs;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64");
}

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ uid: string; email?: string }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Formato de token inválido");
  }

  const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf-8"));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf-8"));

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Cabeçalho JWT inválido");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) {
    throw new Error("Token expirado");
  }
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error("Audience inválida");
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error("Issuer inválido");
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("UID ausente no token");
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error("Certificado público não encontrado para kid");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const signature = base64UrlDecode(parts[2]);
  const isValid = verifier.verify(cert, signature);
  if (!isValid) {
    throw new Error("Assinatura criptográfica inválida");
  }

  return {
    uid: payload.sub,
    email: payload.email,
  };
}

export async function requireAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) {
    return NextResponse.json(
      { error: "Autenticação obrigatória (401 Unauthorized)" },
      { status: 401 }
    );
  }

  let user: { uid: string; email?: string };
  try {
    user = await verifyFirebaseIdToken(bearer);
  } catch {
    return NextResponse.json(
      { error: "Sessão inválida ou expirada (401 Unauthorized)" },
      { status: 401 }
    );
  }

  const allowedUid = process.env.DEVCENTRAL_ADMIN_UID?.trim();
  const allowedEmail =
    process.env.DEVCENTRAL_ADMIN_EMAIL?.trim()?.toLowerCase() ||
    "develop.diskingressos@gmail.com";

  if (allowedUid) {
    if (user.uid !== allowedUid) {
      return NextResponse.json(
        {
          error: "Acesso não autorizado para este UID (403 Forbidden)",
          uid: user.uid,
        },
        { status: 403 }
      );
    }
    return null;
  }

  // Fallback seguro por e-mail do administrador caso DEVCENTRAL_ADMIN_UID ainda não tenha sido preenchido
  if (user.email && user.email.toLowerCase() === allowedEmail) {
    return null;
  }

  return NextResponse.json(
    {
      error:
        "Conta Google não autorizada (403 Forbidden). Copie seu UID abaixo para DEVCENTRAL_ADMIN_UID se você for o administrador.",
      uid: user.uid,
    },
    { status: 403 }
  );
}
