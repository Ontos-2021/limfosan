/** Envío de emails transaccionales (verificación y recuperación). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Proveedor de desarrollo/pruebas: registra y conserva en memoria. */
export class LogEmailSender implements EmailSender {
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    console.log(
      JSON.stringify({
        msg: 'email (log)',
        to: message.to,
        subject: message.subject,
      }),
    );
  }
}

/** Proveedor productivo vía API HTTP de Resend (sin SDK). */
export class ResendEmailSender implements EmailSender {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend respondió ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}

export function verificationEmail(
  appUrl: string,
  token: string,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const url = `${appUrl}/verificar?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Confirmá tu cuenta de Mesa',
    text: `¡Hola! Confirmá tu cuenta abriendo este enlace (vence en 24 horas):\n\n${url}\n\nSi no creaste esta cuenta, ignorá este mensaje.`,
    html: `<p>¡Hola! Confirmá tu cuenta abriendo este enlace (vence en 24 horas):</p><p><a href="${url}">Confirmar mi cuenta</a></p><p>Si no creaste esta cuenta, ignorá este mensaje.</p>`,
  };
}

export function resetEmail(
  appUrl: string,
  token: string,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const url = `${appUrl}/nueva-clave?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Recuperá tu acceso a Mesa',
    text: `Pediste recuperar tu acceso. Elegí una nueva clave aquí (vence en 1 hora):\n\n${url}\n\nSi no fuiste vos, ignorá este mensaje.`,
    html: `<p>Pediste recuperar tu acceso. Elegí una nueva clave aquí (vence en 1 hora):</p><p><a href="${url}">Elegir nueva clave</a></p><p>Si no fuiste vos, ignorá este mensaje.</p>`,
  };
}
