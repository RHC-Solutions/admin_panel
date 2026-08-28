import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const USERS_FILE = path.join((process.env.SHARED_ROOT || process.cwd()), 'cms-data', 'users.json');
const SETTINGS_FILE = path.join((process.env.SHARED_ROOT || process.cwd()), 'cms-data', 'settings.json');
const SECRETS_FILE = path.join((process.env.SHARED_ROOT || process.cwd()), 'cms-data', 'secrets.json');

// Abuse mitigation. Reset is intentionally unauthenticated (forgot-password
// flow), but the password is only delivered to a pre-configured Telegram
// chat. Without limits, an attacker could repeatedly invalidate the admin's
// password and reset MFA from anonymous internet. Keep buckets in-process —
// fine for a single PM2 instance; behind a load balancer move to Redis.
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 3;
const ACCOUNT_COOLDOWN_MS = 60 * 60 * 1000;
const ipBucket = new Map<string, number[]>();
const accountLastReset = new Map<string, number>();

function getClientIp(req: NextRequest): string {
  // Behind Cloudflare, cf-connecting-ip is the trustworthy client IP. Prefer it
  // over the client-spoofable x-forwarded-for so an attacker can't rotate the
  // header to defeat the reset rate-limit or lock out a victim IP.
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function ipRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipBucket.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipBucket.set(ip, hits);
  return hits.length > IP_MAX;
}

// Generate a secure 64-character password with extra complexity
function generateSecurePassword(length: number = 64): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + specialChars;
  
  let password = '';
  
  // Ensure at least 2 of each type for extra complexity
  for (let i = 0; i < 2; i++) {
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];
  }
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to randomize the guaranteed characters
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Send message to Telegram
async function sendToTelegram(botToken: string, chatId: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      console.error('Telegram API error:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send to Telegram:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (ipRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many reset attempts. Try again later.' },
        { status: 429 }
      );
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Generic success response used to prevent account enumeration. Any path
    // that would have returned 404/403/400 for a missing/non-admin account
    // returns this same payload after the rate-limit check.
    const genericOk = NextResponse.json({
      success: true,
      message: 'If this account is eligible, the new password has been sent via Telegram.',
    });

    // Load users
    if (!fs.existsSync(USERS_FILE)) {
      return genericOk;
    }

    const usersData = fs.readFileSync(USERS_FILE, 'utf-8');
    const users = JSON.parse(usersData);

    // Find user
    const userIndex = users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (userIndex === -1) {
      return genericOk;
    }

    const user = users[userIndex];

    // Check if user is admin
    if (user.role !== 'admin') {
      return genericOk;
    }

    // Per-account cooldown — prevents repeated MFA wipes for a known admin email.
    const last = accountLastReset.get(user.email.toLowerCase()) || 0;
    if (Date.now() - last < ACCOUNT_COOLDOWN_MS) {
      return genericOk;
    }
    accountLastReset.set(user.email.toLowerCase(), Date.now());

    // Load Telegram credentials. The live bots are configured in
    // cms-data/secrets.json (admin → Integrations), keyed by purpose — NOT in
    // settings.json (which is why this previously reported "not configured"
    // even though Telegram was set up). Prefer the dedicated login-alert bot,
    // fall back to the contact bot, then the legacy settings.json block.
    let telegramConfig = { botToken: '', chatId: '' };
    try {
      if (fs.existsSync(SECRETS_FILE)) {
        const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
        // Pick a MATCHED bot+chat pair (a bot can only message chats it belongs
        // to). Prefer the CONTACT pair — that's the channel the login-alert
        // notifications actually deliver to, so the admin already monitors it;
        // fall back to the dedicated login-alert pair.
        const pairs: Array<[string, string]> = [
          [secrets.TELEGRAM_CONTACT_BOT_TOKEN, secrets.TELEGRAM_CONTACT_CHAT_ID],
          [secrets.TELEGRAM_LOGIN_ALERT_BOT_TOKEN, secrets.TELEGRAM_LOGIN_ALERT_CHAT_ID],
        ];
        const match = pairs.find(([b, c]) => b && c);
        if (match) telegramConfig = { botToken: match[0], chatId: match[1] };
      }
    } catch { /* fall through to settings.json */ }
    if ((!telegramConfig.botToken || !telegramConfig.chatId) && fs.existsSync(SETTINGS_FILE)) {
      try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        if (settings.telegram?.botToken && settings.telegram?.chatId) telegramConfig = settings.telegram;
      } catch { /* ignore */ }
    }

    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      return NextResponse.json({ 
        error: 'Telegram is not configured. Please configure Telegram settings in admin panel first.' 
      }, { status: 400 });
    }

    // Generate new password
    const newPassword = generateSecurePassword(64);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    users[userIndex] = {
      ...user,
      passwordHash,
      updatedAt: new Date().toISOString(),
      updatedBy: 'password-reset',
      // Reset TOTP to allow login without it
      totpEnabled: false,
      totpSecret: undefined,
      totpTempSecret: undefined,
      recoveryCodes: [],
    };

    // Save users
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    // Send to Telegram
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const message = `🔐 <b>Admin Password Reset</b>

<b>Account:</b> ${user.name} (${user.email})
<b>Timestamp:</b> ${timestamp} UTC

<b>New Password:</b>
<code>${newPassword}</code>

⚠️ <b>Important:</b>
• This password is 64 characters long with high complexity
• 2FA/TOTP has been disabled for this account
• Please enable 2FA again after logging in
• Delete this message after copying the password

<b>Next Steps:</b>
1. Copy the password above
2. Go to ${process.env.NEXT_PUBLIC_SITE_URL || 'https://rhcsolutions.com'}/admin/login
3. Log in with your email and this password
4. Re-enable 2FA in security settings

This is an automated security notification from RHC Solutions Admin Panel.`;

    const sent = await sendToTelegram(telegramConfig.botToken, telegramConfig.chatId, message);

    if (!sent) {
      // Rollback password change if Telegram send fails
      users[userIndex] = user;
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
      return NextResponse.json({ 
        error: 'Failed to send password to Telegram. Please verify your Telegram settings.' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Password has been reset and sent to Telegram. 2FA has been disabled.',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
