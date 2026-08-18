import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  getCloudPanelConfig,
  setCloudPanelConfig,
  readInventory,
  runCommand,
  listCommands,
  COMMANDS,
  EXCLUDED_COMMANDS,
  ClpctlValidationError,
} from '@adminpanel/lib/cloudpanel';
import { recordAudit } from '@adminpanel/lib/audit';

/**
 * CloudPanel module API.
 *
 * /api/cms/* is already gated by middleware (JWT + role + MFA), but this handler
 * re-checks `role === 'admin'` itself. Everything behind it runs as root on the
 * host, so it does not rely on a single upstream gate — and editors, who are
 * legitimate /api/cms/* callers, must never reach it.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

function clientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

async function requireAdmin(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token || (token as any).role !== 'admin') return null;
  return token;
}

/**
 * The value the operator must retype to confirm a destructive command: the
 * thing being destroyed, not a generic "yes".
 */
function confirmationTarget(params: Record<string, unknown>): string | null {
  for (const key of ['domainName', 'userName', 'databaseName']) {
    const v = params?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const token = await requireAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [config, inventory] = await Promise.all([getCloudPanelConfig(), readInventory()]);
    return NextResponse.json(
      { config, inventory, commands: listCommands(), excludedCommands: EXCLUDED_COMMANDS },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[api/cms/cloudpanel] GET', err);
    return NextResponse.json({ error: 'Failed to read CloudPanel state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = await requireAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const actorEmail = (token as any).email || 'admin';
  const ip = clientIp(request);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body?.action;

  /* ---------------------------------------------------------------- config */

  if (action === 'config') {
    try {
      const patch = body?.config ?? {};
      const next = await setCloudPanelConfig({
        enabled: patch.enabled,
        dbPath: patch.dbPath,
        wrapperPath: patch.wrapperPath,
        useSudo: patch.useSudo,
        allowDestructive: patch.allowDestructive,
      });
      await recordAudit({
        actorEmail,
        ip,
        action: 'cloudpanel.config',
        target: 'cloudpanel',
        detail: {
          enabled: next.enabled,
          allowDestructive: next.allowDestructive,
          useSudo: next.useSudo,
          dbPath: next.dbPath,
          wrapperPath: next.wrapperPath,
        },
      });
      return NextResponse.json({ config: next }, { headers: NO_STORE });
    } catch (err) {
      console.error('[api/cms/cloudpanel] config', err);
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
    }
  }

  /* ------------------------------------------------------------------- run */

  if (action === 'run') {
    const command = typeof body?.command === 'string' ? body.command : '';
    const params: Record<string, unknown> =
      body?.params && typeof body.params === 'object' && !Array.isArray(body.params) ? body.params : {};
    const dryRun = body?.dryRun !== false; // opt OUT of dry-run, never opt in by omission
    const spec = Object.prototype.hasOwnProperty.call(COMMANDS, command) ? COMMANDS[command] : undefined;

    if (!spec) {
      return NextResponse.json({ error: `Unknown or disallowed command: ${command}` }, { status: 400 });
    }

    // Typed confirmation for destructive verbs, checked before we build argv so a
    // mistyped confirmation never reaches the spawn path.
    if (spec.destructive && !dryRun) {
      const target = confirmationTarget(params);
      const confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
      if (!target || confirm !== target) {
        return NextResponse.json(
          {
            error: `This is a destructive command. Retype "${target ?? 'the target'}" in the confirmation field to proceed.`,
          },
          { status: 400 },
        );
      }
    }

    try {
      const result = await runCommand(command, params, { dryRun });

      if (!dryRun) {
        // argv is the redacted form — secrets are masked in clpctl.buildCommand.
        await recordAudit({
          actorEmail,
          ip,
          action: `cloudpanel.${command}`,
          target: confirmationTarget(params),
          detail: {
            argv: result.argv,
            ok: result.ok,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            destructive: !!spec.destructive,
            error: result.error ?? null,
          },
        });
      }

      return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
    } catch (err) {
      if (err instanceof ClpctlValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error('[api/cms/cloudpanel] run', err);
      return NextResponse.json({ error: 'Command failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
