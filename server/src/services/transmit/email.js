import nodemailer from 'nodemailer';
import { config } from '../../config.js';

let transport;
const getTransport = () => (transport ??= nodemailer.createTransport({
  host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  requireTLS: true, // Transportverschlüsselung erzwingen
}));

export async function sendEmail({ app, city, packet }) {
  if (!city.authority.email) throw new Error('Für diese Stadt ist keine E-Mail-Adresse hinterlegt');
  const p = app.data.person;
  const info = await getTransport().sendMail({
    from: config.smtp.from,
    to: city.authority.email,
    replyTo: config.smtp.replyTo,
    subject: `Gewerbeanmeldung ${p.lastName}, ${p.firstName} – Vorgang ${app.ref}`,
    text: [
      'Sehr geehrte Damen und Herren,',
      '',
      `anbei die Gewerbeanmeldung für ${p.firstName} ${p.lastName} inklusive Vollmacht und Ausweiskopie.`,
      `Bitte antworten Sie unter Angabe der Vorgangsnummer ${app.ref}.`,
      '',
      'Mit freundlichen Grüßen',
      config.sender.name,
    ].join('\n'),
    attachments: [{ filename: `Gewerbeanmeldung_${app.ref}.pdf`, content: packet }],
    headers: { 'X-GA-Ref': app.ref },
  });
  return { channel: 'email', status: 'transmitted', reference: info.messageId, proof: { accepted: info.accepted, response: info.response } };
}
