import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { cmsDb } from '@adminpanel/lib/cms/database';
import fs from 'fs';
import path from 'path';
import { revalidateAllPublic } from '@adminpanel/lib/revalidate';

async function requireWriter(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return false;
  const role = String((token as any).role || '').toLowerCase();
  return ['admin', 'administrator', 'editor'].includes(role);
}

// This endpoint is PUBLIC on GET (whitelisted in the middleware) so the site
// chrome can read siteName/nav/footer/branding without auth. It must therefore
// never expose secret-bearing settings. Telegram bot credentials (and any
// token/secret/password/apiKey field) are stripped from the response here.
// Server-side consumers that need those values (password-reset fallback,
// getPublicSettings) read the DB directly, so scrubbing the HTTP body is safe.
const SECRET_KEY_RE = /token|secret|password|apikey|api_key|chatid|passwordhash/i;
function scrubSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k)) continue;
      out[k] = scrubSecrets(v);
    }
    return out;
  }
  return value;
}

// GET /api/cms/settings - Get site settings (public; secrets scrubbed)
export async function GET() {
  try {
    // Ensure settings file exists by reading settings (which initializes if needed)
    const settings = await cmsDb.getSettings();
    const { _pentest, ...safe } = (settings || {}) as Record<string, any>;
    return NextResponse.json(scrubSecrets(safe));
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT /api/cms/settings - Update site settings
export async function PUT(request: NextRequest) {
  if (!(await requireWriter(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const updatedSettings = await cmsDb.updateSettings(body);
    revalidateAllPublic();
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
