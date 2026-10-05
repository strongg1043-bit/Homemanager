import emailjs from '@emailjs/browser';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// All EmailJS credentials must be set in .env.local (see .env.example).
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string;
const REPLY_TO   = import.meta.env.VITE_EMAILJS_REPLY_TO   as string ?? '';

// Initialize EmailJS once at module load
emailjs.init(PUBLIC_KEY);

// ── Notification IDs ──────────────────────────────────────────────────────────
export type NotificationId =
  | 'payment-confirmation'
  | 'task-approved'
  | 'task-needs-retry'
  | 'welcome'
  | 'cashout-request'
  | 'parent-invite';

export interface NotificationConfig {
  sustainabilityFooter: boolean;
}

export type EmailSettingsMap = Record<NotificationId, NotificationConfig>;

export const DEFAULT_EMAIL_SETTINGS: EmailSettingsMap = {
  'payment-confirmation': { sustainabilityFooter: true },
  'task-approved':        { sustainabilityFooter: true },
  'task-needs-retry':     { sustainabilityFooter: true },
  'welcome':              { sustainabilityFooter: true },
  'cashout-request':      { sustainabilityFooter: true },
  'parent-invite':        { sustainabilityFooter: true },
};

// Simple module-level cache — refreshed once per session
let _settingsCache: EmailSettingsMap | null = null;

export async function getEmailSettings(): Promise<EmailSettingsMap> {
  if (_settingsCache) return _settingsCache;
  try {
    // Stored under the existing /settings collection which has auth-gated rules
    const snap = await getDoc(doc(db, 'settings', 'sustainabilityFooter'));
    if (snap.exists()) {
      _settingsCache = { ...DEFAULT_EMAIL_SETTINGS, ...(snap.data() as Partial<EmailSettingsMap>) };
    } else {
      _settingsCache = { ...DEFAULT_EMAIL_SETTINGS };
    }
  } catch {
    _settingsCache = { ...DEFAULT_EMAIL_SETTINGS };
  }
  return _settingsCache;
}

/** Call after saving settings so the next email picks up fresh values */
export function invalidateEmailSettingsCache() {
  _settingsCache = null;
}

interface EmailParams {
  to_email: string;
  to_name: string;
  subject: string;
  message_html: string;
}

// Wrap body in consistent email shell
function wrapEmail(body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1f2937">
    <div style="background:#1B3A5C;padding:24px;text-align:center;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:24px">🏠 Home Anchor</h1>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      ${body}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af">
        Sent by Home Anchor · Empowering family teamwork
      </div>
    </div>
  </div>`;
}

// Returns sustainability HTML only when the per-notification flag is enabled
async function getSustainabilityHtml(notificationId: NotificationId): Promise<string> {
  const settings = await getEmailSettings();
  if (!settings[notificationId]?.sustainabilityFooter) return '';
  return `
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:24px;margin-top:32px;font-family:Arial,sans-serif">
      <p style="font-size:20px;margin:0 0 8px;text-align:center">⚓</p>
      <p style="font-weight:700;margin:0 0 6px;color:#92400e;text-align:center;font-size:15px">Support Home Anchor</p>
      <p style="font-size:13px;color:#78350f;line-height:1.6;margin:0 0 16px;text-align:center">
        Home Anchor is built with love by an independent developer.<br/>
        If you find it valuable, consider supporting the journey!
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="border-bottom:1px solid #fde68a">
          <td style="padding:6px 0;color:#92400e;font-weight:600;width:45%">Account Holder</td>
          <td style="padding:6px 0;color:#1c1917;font-family:monospace">Home Anchor</td>
        </tr>
        <tr style="border-bottom:1px solid #fde68a">
          <td style="padding:6px 0;color:#92400e;font-weight:600">Bank</td>
          <td style="padding:6px 0;color:#1c1917;font-family:monospace">Capitec Bank, South Africa</td>
        </tr>
        <tr style="border-bottom:1px solid #fde68a">
          <td style="padding:6px 0;color:#92400e;font-weight:600">Account Number</td>
          <td style="padding:6px 0;color:#1c1917;font-family:monospace">2541543057</td>
        </tr>
        <tr style="border-bottom:1px solid #fde68a">
          <td style="padding:6px 0;color:#92400e;font-weight:600">Branch Code</td>
          <td style="padding:6px 0;color:#1c1917;font-family:monospace">470010</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#92400e;font-weight:600">SWIFT / BIC</td>
          <td style="padding:6px 0;color:#1c1917;font-family:monospace">CABLZAJJ</td>
        </tr>
      </table>
      <p style="font-size:11px;color:#a16207;margin:12px 0 0;text-align:center">
        International wire: use SWIFT/BIC · Local SA transfers: use Branch Code
      </p>
    </div>`;
}

// Replace template variables with actual values
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

// Load template from Firestore by ID
async function getTemplate(templateId: string) {
  try {
    const snap = await getDoc(doc(db, 'emailTemplates', templateId));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// Core send function — uses EmailJS with Gmail
async function sendEmail(params: EmailParams): Promise<void> {
  try {
    await emailjs.send(SERVICE_ID, 'template_homemanager', {
      to_email: params.to_email,
      to_name: params.to_name,
      subject: params.subject,
      message_html: params.message_html,
      from_name: 'Home Anchor',
      reply_to: REPLY_TO,
    }, PUBLIC_KEY);
    console.log('Email sent to', params.to_email);
  } catch (err) {
    console.error('EmailJS error:', err);
    // Don't throw — email failure should never block app functionality
  }
}

// ── PUBLIC EMAIL FUNCTIONS ──

export async function sendPaymentConfirmedEmail(
  childEmail: string,
  childName: string,
  parentName: string,
  amount: number,
  currencySymbol: string = 'R',
  paymentMethod?: string,
  reference?: string,
) {
  const sustHtml = await getSustainabilityHtml('payment-confirmation');
  const template = await getTemplate('payment-confirmation');
  
  const vars = {
    childName, parentName,
    amount: amount.toString(),
    currencySymbol,
    date: new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }),
    paymentMethod: paymentMethod || 'Cash',
    reference: reference || 'N/A',
  };

  let body = template?.bodyHtml 
    ? fillTemplate(template.bodyHtml, vars)
    : `<h2 style="color:#1f2937">Great news, ${childName}! 🎉</h2>
       <p>${parentName} has confirmed your payment of <strong>${currencySymbol}${amount}</strong>.</p>
       <p>Your dedication made this happen. Keep it up!</p>
       <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;margin:16px 0">
         <p style="margin:0"><strong>Amount:</strong> ${currencySymbol}${amount}</p>
         <p style="margin:4px 0 0"><strong>Method:</strong> ${paymentMethod || 'Cash'}</p>
         ${reference ? `<p style="margin:4px 0 0"><strong>Reference:</strong> ${reference}</p>` : ''}
         <p style="margin:4px 0 0"><strong>Date:</strong> ${vars.date}</p>
       </div>`;

  const subject = template?.subject 
    ? fillTemplate(template.subject, vars)
    : `💰 Payment confirmed, ${childName}!`;

  await sendEmail({
    to_email: childEmail,
    to_name: childName,
    subject,
    message_html: wrapEmail(body + sustHtml),
  });
}

export async function sendTaskApprovedEmail(
  childEmail: string,
  childName: string,
  taskTitle: string,
  pointsEarned: number,
) {
  const sustHtml = await getSustainabilityHtml('task-approved');
  const template = await getTemplate('task-approved');
  const vars = { childName, taskTitle, pointsEarned: pointsEarned.toString() };

  const body = template?.bodyHtml
    ? fillTemplate(template.bodyHtml, vars)
    : `<h2 style="color:#1f2937">✅ Task approved, ${childName}!</h2>
       <p><strong>"${taskTitle}"</strong> has been reviewed and approved.</p>
       <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;margin:16px 0">
         <p style="margin:0;font-size:20px;font-weight:700;color:#065f46">+${pointsEarned} points</p>
         <p style="margin:4px 0 0;color:#374151">Added to your wallet</p>
       </div>
       <p>Keep up the great work!</p>`;

  const subject = template?.subject
    ? fillTemplate(template.subject, vars)
    : `✅ Well done! "${taskTitle}" approved`;

  await sendEmail({ to_email: childEmail, to_name: childName, subject, message_html: wrapEmail(body + sustHtml) });
}

export async function sendTaskNeedsRetryEmail(
  childEmail: string,
  childName: string,
  taskTitle: string,
) {
  const sustHtml = await getSustainabilityHtml('task-needs-retry');
  const template = await getTemplate('task-needs-retry');
  const vars = { childName, taskTitle };

  const body = template?.bodyHtml
    ? fillTemplate(template.bodyHtml, vars)
    : `<h2 style="color:#1f2937">💪 Almost there, ${childName}!</h2>
       <p><strong>"${taskTitle}"</strong> needs a little more work before it can be approved.</p>
       <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:4px;margin:16px 0">
         <p style="margin:0;font-weight:600;color:#92400e">Check the feedback and give it another go. You've got this!</p>
       </div>`;

  const subject = template?.subject
    ? fillTemplate(template.subject, vars)
    : `💪 Almost there — "${taskTitle}"`;

  await sendEmail({ to_email: childEmail, to_name: childName, subject, message_html: wrapEmail(body + sustHtml) });
}

export async function sendWelcomeEmail(
  recipientEmail: string,
  recipientName: string,
  familyName: string,
  role: 'parent' | 'child',
  householdCode?: string,
) {
  const sustHtml = await getSustainabilityHtml('welcome');
  const template = await getTemplate('welcome');

  const BASE_URL = (import.meta.env.VITE_APP_URL as string) || 'https://homemanager-c409a.web.app';
  const joinUrl = householdCode
    ? `${BASE_URL}/?code=${householdCode}`
    : BASE_URL;

  const vars = { familyName, childName: recipientName, parentName: recipientName, appUrl: joinUrl };

  const joinBlock = householdCode
    ? `<div style="background:#F4F7FB;border:1px solid #C3D1E6;border-radius:12px;padding:24px;margin:24px 0;text-align:center">
         <p style="text-transform:uppercase;font-size:10px;font-weight:900;color:#2E7D6B;letter-spacing:0.1em;margin:0 0 8px">Your Household Join Code</p>
         <p style="font-size:36px;font-weight:900;color:#1B3A5C;font-family:monospace;margin:0 0 16px;letter-spacing:0.2em">${householdCode}</p>
         <a href="${joinUrl}" style="background:#1B3A5C;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
           Join ${familyName} Now →
         </a>
         <p style="font-size:11px;color:#6b7280;margin:12px 0 0">The link above takes you straight in — code pre-filled!</p>
       </div>`
    : `<p><a href="${BASE_URL}" style="background:#1B3A5C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px">Open Home Anchor →</a></p>`;

  const body = template?.bodyHtml
    ? fillTemplate(template.bodyHtml, vars)
    : `<h2 style="color:#1f2937">Welcome to Home Anchor! 🏠</h2>
       <p>You've been invited to the <strong>${familyName}</strong> household.</p>
       ${role === 'parent'
         ? '<p>As a parent, you can create tasks, set rewards, and track your children\'s progress.</p>'
         : '<p>Check your tasks, complete them with photo proof, and start earning rewards!</p>'
       }
       ${joinBlock}`;

  const subject = template?.subject
    ? fillTemplate(template.subject, vars)
    : `🏠 You're invited to join ${familyName} on Home Anchor!`;

  await sendEmail({ to_email: recipientEmail, to_name: recipientName, subject, message_html: wrapEmail(body + sustHtml) });
}

export async function sendCashoutRequestEmail(
  parentEmail: string,
  parentName: string,
  childName: string,
  amount: number,
  currencySymbol: string = 'R',
) {
  const sustHtml = await getSustainabilityHtml('cashout-request');
  const body = `
    <h2 style="color:#1f2937">💸 Cash-out requested</h2>
    <p><strong>${childName}</strong> has requested a cash-out of <strong>${currencySymbol}${amount}</strong>.</p>
    <div style="background:#F4F7FB;border-left:4px solid #2E7D6B;padding:16px;border-radius:4px;margin:16px 0">
      <p style="margin:0;font-size:20px;font-weight:700;color:#1B3A5C">${currencySymbol}${amount}</p>
      <p style="margin:4px 0 0">Awaiting your payment</p>
    </div>
    <p><a href="${(import.meta.env.VITE_APP_URL as string) || 'https://homemanager-c409a.web.app'}" style="background:#1B3A5C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px">Review in Home Anchor →</a></p>`;

  await sendEmail({
    to_email: parentEmail,
    to_name: parentName,
    subject: `💸 ${childName} requested R${amount} cash-out`,
    message_html: wrapEmail(body + sustHtml),
  });
}

// ── Admin alert: new family registered ───────────────────────────────────────
// Reads admin emails from settings/adminAccess and notifies each one.
// Called fire-and-forget from HouseholdSetup — never throws to the caller.
export async function sendNewFamilyAdminAlert(
  familyName: string,
  creatorName: string,
  creatorEmail: string,
  householdId: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'adminAccess'));
    if (!snap.exists()) return;
    const adminEmails: string[] = snap.data().emails || [];
    if (adminEmails.length === 0) return;

    const timestamp = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const body = `
      <h2 style="color:#1B3A5C">🏠 New Family Registered</h2>
      <p>A new household just joined <strong>Home Anchor</strong>.</p>
      <div style="background:#F4F7FB;border-left:4px solid #2E7D6B;padding:16px;border-radius:4px;margin:16px 0">
        <p style="margin:0"><strong>Family name:</strong> ${familyName}</p>
        <p style="margin:6px 0 0"><strong>Created by:</strong> ${creatorName}${creatorEmail ? ` &lt;${creatorEmail}&gt;` : ''}</p>
        <p style="margin:6px 0 0"><strong>Household ID:</strong> <code style="font-family:monospace;font-size:12px;background:#e2e8f0;padding:2px 6px;border-radius:4px">${householdId}</code></p>
        <p style="margin:6px 0 0"><strong>Registered at:</strong> ${timestamp}</p>
      </div>
      <p>
        <a href="${(import.meta.env.VITE_ADMIN_URL as string) || 'https://homemanager-live.web.app'}"
           style="background:#1B3A5C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">
          View in Admin Portal →
        </a>
      </p>`;

    await Promise.all(
      adminEmails.map(email =>
        sendEmail({
          to_email: email,
          to_name: 'Admin',
          subject: `🏠 New family registered: ${familyName}`,
          message_html: wrapEmail(body),
        })
      )
    );
  } catch (err) {
    // Non-fatal — never block household creation
    console.error('Admin alert failed:', err);
  }
}

/**
 * Child-specific invite email that prominently features the welcome reward.
 * Called when a parent invites a child and sets an onboarding reward.
 * Fire-and-forget — never throws to caller.
 */
export async function sendChildInviteEmail(
  childEmail: string,
  childName: string,
  householdName: string,
  householdCode: string,
  onboardingPoints: number,
  senderName: string,
  currencySymbol: string = 'R',
): Promise<void> {
  const sustHtml = await getSustainabilityHtml('welcome');
  const BASE_URL = (import.meta.env.VITE_APP_URL as string) || 'https://homemanager-c409a.web.app';
  const joinUrl = `${BASE_URL}/?code=${householdCode}&email=${encodeURIComponent(childEmail)}`;

  const body = `
    <h2 style="color:#1f2937">Hey ${childName}! 🎉 You've been invited to Home Anchor!</h2>
    <p style="color:#4b5563;line-height:1.6">${senderName} has set up your family household — the app where you can earn real rewards just for helping at home.</p>

    <div style="background:linear-gradient(135deg,#1B3A5C 0%,#2E7D6B 100%);border-radius:20px;padding:32px;margin:28px 0;text-align:center;color:#fff">
      <p style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px;opacity:0.75">Your First Mission Reward</p>
      <p style="font-size:56px;font-weight:900;margin:0 0 2px;line-height:1">${currencySymbol}${onboardingPoints}</p>
      <p style="font-size:15px;margin:0 0 18px;opacity:0.85;font-weight:600">ready and waiting for you!</p>
      <p style="font-size:13px;margin:0;opacity:0.7;line-height:1.5">Register, join the <strong style="opacity:1">${householdName}</strong> family,<br/>and mark your first task complete to claim it.</p>
    </div>

    <div style="background:#F4F7FB;border:1px solid #C3D1E6;border-radius:16px;padding:28px;margin:28px 0;text-align:center">
      <p style="text-transform:uppercase;font-size:10px;font-weight:900;color:#2E7D6B;letter-spacing:0.12em;margin:0 0 10px">Your Family Join Code</p>
      <p style="font-size:40px;font-weight:900;color:#1B3A5C;font-family:monospace;margin:0 0 20px;letter-spacing:0.2em">${householdCode}</p>
      <a href="${joinUrl}" style="background:#1B3A5C;color:#fff;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:800;font-size:16px;display:inline-block;letter-spacing:0.02em">
        Register &amp; Claim ${currencySymbol}${onboardingPoints} →
      </a>
      <p style="font-size:11px;color:#6b7280;margin:14px 0 0">The link above takes you straight in — code pre-filled!</p>
    </div>

    <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin:20px 0">
      <p style="font-weight:800;color:#065f46;margin:0 0 12px;font-size:14px">How to claim your ${currencySymbol}${onboardingPoints}:</p>
      <p style="color:#374151;font-size:13px;line-height:1.8;margin:0">
        1️⃣ Click the button above to create your account<br/>
        2️⃣ Enter the join code to join <strong>${householdName}</strong><br/>
        3️⃣ Find your "Complete Your Registration" task on the Home screen<br/>
        4️⃣ Mark it complete — your ${currencySymbol}${onboardingPoints} lands instantly 🚀
      </p>
    </div>`;

  await sendEmail({
    to_email: childEmail,
    to_name: childName,
    subject: `🎉 You can earn ${currencySymbol}${onboardingPoints} — ${senderName} invited you to Home Anchor!`,
    message_html: wrapEmail(body + sustHtml),
  });
}

export async function sendParentInviteEmail(
  parentEmail: string,
  childName: string,
  householdCode: string,
  householdName: string
) {
  const sustHtml = await getSustainabilityHtml('parent-invite');
  const body = `
    <h2 style="color:#1f2937">🚀 ${childName} is calling you out!</h2>
    <p>Your child <strong>${childName}</strong> has been working hard on <strong>Home Anchor</strong> and wants you to join the team!</p>
    
    <div style="background:#fefce8;border:1px solid #fef08a;border-radius:12px;padding:24px;margin:24px 0;text-align:center">
      <p style="text-transform:uppercase;font-size:10px;font-weight:900;color:#854d0e;letter-spacing:0.1em;margin-bottom:8px">Your Household Code</p>
      <p style="font-size:32px;font-weight:900;color:#1B3A5C;font-family:monospace;margin:0;letter-spacing:0.2em">${householdCode}</p>
    </div>

    <p style="font-style:italic;color:#4b5563;border-left:4px solid #e5e7eb;padding-left:16px;margin:24px 0">
      "Yo! I've been grinding away on Home Anchor, earning points like a legend. Time to stop the under-the-table deals and make it official. Download the app and manage me properly! 🏆"
    </p>

    <p><a href="${(import.meta.env.VITE_APP_URL as string) || 'https://homemanager-c409a.web.app'}/?code=${householdCode}" style="background:#1B3A5C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px">Join ${householdName} →</a></p>
  `;

  await sendEmail({
    to_email: parentEmail,
    to_name: 'Parent',
    subject: `🚀 ${childName} wants you to join Home Anchor!`,
    message_html: wrapEmail(body + sustHtml),
  });
}
