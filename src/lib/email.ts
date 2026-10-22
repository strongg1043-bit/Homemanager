import emailjs from '@emailjs/browser';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// All EmailJS credentials must be set in .env.local (see .env.example).
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string;
const REPLY_TO   = import.meta.env.VITE_EMAILJS_REPLY_TO   as string ?? '';

// Initialize EmailJS once at module load
emailjs.init(PUBLIC_KEY);

interface EmailParams {
  to_email: string;
  to_name: string;
  subject: string;
  message_html: string;
}

// Wrap body in consistent email shell
function wrapEmail(body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1f2937">
    <div style="background:#267A6B;padding:24px;text-align:center;border-radius:12px 12px 0 0">
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

// Load sustainability message from Firestore settings
async function getSustainabilityHtml(): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'email'));
    const sust = snap.data()?.sustainability;
    if (!sust || !sust.showMessage) return '';
    return `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:20px;margin-top:32px;text-align:center;font-family:Arial,sans-serif">
        <p style="font-size:20px;margin:0 0 8px">💛</p>
        <p style="font-weight:600;margin:0 0 8px;color:#92400e">Support Home Anchor</p>
        <p style="font-size:14px;color:#78350f;line-height:1.6;margin:0 0 12px">${sust.message || ''}</p>
        <p style="font-size:13px;color:#92400e;font-weight:500">${sust.donationDetails || ''}</p>
      </div>`;
  } catch { return ''; }
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
  const sustHtml = await getSustainabilityHtml();
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
  const sustHtml = await getSustainabilityHtml();
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
  const sustHtml = await getSustainabilityHtml();
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
) {
  const sustHtml = await getSustainabilityHtml();
  const template = await getTemplate('welcome');
  const vars = { familyName, childName: recipientName, parentName: recipientName, appUrl: 'https://homemanager-956389666150.us-west1.run.app' };

  const body = template?.bodyHtml
    ? fillTemplate(template.bodyHtml, vars)
    : `<h2 style="color:#1f2937">Welcome to Home Anchor! 🏠</h2>
       <p>The <strong>${familyName}</strong> household is all set up.</p>
       ${role === 'parent' 
         ? '<p>Start by creating your first task for your children — set a reward, a KPI, and let them get to work!</p>'
         : '<p>Check your tasks, complete them with photo proof, and start earning rewards!</p>'
       }
       <p><a href="https://homemanager-956389666150.us-west1.run.app" style="background:#267A6B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px">Open Home Anchor →</a></p>`;

  const subject = template?.subject
    ? fillTemplate(template.subject, vars)
    : `🏠 Welcome to Home Anchor, ${familyName}!`;

  await sendEmail({ to_email: recipientEmail, to_name: recipientName, subject, message_html: wrapEmail(body + sustHtml) });
}

export async function sendCashoutRequestEmail(
  parentEmail: string,
  parentName: string,
  childName: string,
  amount: number,
  currencySymbol: string = 'R',
) {
  const sustHtml = await getSustainabilityHtml();
  const body = `
    <h2 style="color:#1f2937">💸 Cash-out requested</h2>
    <p><strong>${childName}</strong> has requested a cash-out of <strong>${currencySymbol}${amount}</strong>.</p>
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px;border-radius:4px;margin:16px 0">
      <p style="margin:0;font-size:20px;font-weight:700;color:#1e3a8a">${currencySymbol}${amount}</p>
      <p style="margin:4px 0 0">Awaiting your payment</p>
    </div>
    <p><a href="https://homemanager-956389666150.us-west1.run.app" style="background:#267A6B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px">Review in Home Anchor →</a></p>`;

  await sendEmail({
    to_email: parentEmail,
    to_name: parentName,
    subject: `💸 ${childName} requested R${amount} cash-out`,
    message_html: wrapEmail(body + sustHtml),
  });
}

export async function sendParentInviteEmail(
  parentEmail: string,
  childName: string,
  householdCode: string,
  householdName: string
) {
  const sustHtml = await getSustainabilityHtml();
  const body = `
    <h2 style="color:#1f2937">🚀 ${childName} is calling you out!</h2>
    <p>Your child <strong>${childName}</strong> has been working hard on <strong>Home Anchor</strong> and wants you to join the team!</p>
    
    <div style="background:#fefce8;border:1px solid #fef08a;border-radius:12px;padding:24px;margin:24px 0;text-align:center">
      <p style="text-transform:uppercase;font-size:10px;font-weight:900;color:#854d0e;letter-spacing:0.1em;margin-bottom:8px">Your Household Code</p>
      <p style="font-size:32px;font-weight:900;color:#1e3a8a;font-family:monospace;margin:0;letter-spacing:0.2em">${householdCode}</p>
    </div>

    <p style="font-style:italic;color:#4b5563;border-left:4px solid #e5e7eb;padding-left:16px;margin:24px 0">
      "Yo! I've been grinding away on Home Anchor, earning points like a legend. Time to stop the under-the-table deals and make it official. Download the app and manage me properly! 🏆"
    </p>

    <p><a href="https://homemanager-956389666150.us-west1.run.app" style="background:#267A6B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:16px">Join ${householdName} →</a></p>
  `;

  await sendEmail({
    to_email: parentEmail,
    to_name: 'Parent',
    subject: `🚀 ${childName} wants you to join Home Anchor!`,
    message_html: wrapEmail(body + sustHtml),
  });
}
