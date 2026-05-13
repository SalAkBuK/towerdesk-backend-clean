export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  send(input: SendEmailInput): Promise<void>;
}
