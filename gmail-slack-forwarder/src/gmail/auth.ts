import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { google, Auth } from 'googleapis';
import type { GmailCredentials, GmailToken } from './types.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const REDIRECT_PORT = parseInt(process.env.OAUTH_REDIRECT_PORT ?? '3333', 10);
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

export class GmailAuth {
  private credentials: GmailCredentials;

  constructor(credentialsPath: string) {
    if (!existsSync(credentialsPath)) {
      throw new Error(`Credentials file not found: ${credentialsPath}`);
    }
    const content = readFileSync(credentialsPath, 'utf-8');
    this.credentials = JSON.parse(content) as GmailCredentials;
  }

  private getOAuth2Client(): Auth.OAuth2Client {
    const creds = this.credentials.installed ?? this.credentials.web;
    if (!creds) {
      throw new Error('Invalid credentials file: missing installed or web configuration');
    }

    return new google.auth.OAuth2(
      creds.client_id,
      creds.client_secret,
      REDIRECT_URI
    );
  }

  async loadToken(tokenPath: string): Promise<GmailToken | null> {
    if (!existsSync(tokenPath)) {
      return null;
    }
    const content = readFileSync(tokenPath, 'utf-8');
    return JSON.parse(content) as GmailToken;
  }

  async saveToken(tokenPath: string, token: GmailToken): Promise<void> {
    const dir = dirname(tokenPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(tokenPath, JSON.stringify(token, null, 2));
  }

  getAuthUrl(): string {
    const oauth2Client = this.getOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
  }

  async exchangeCodeForToken(code: string): Promise<GmailToken> {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to get tokens from authorization code');
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope ?? SCOPES.join(' '),
      token_type: tokens.token_type ?? 'Bearer',
      expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
    };
  }

  async refreshToken(token: GmailToken): Promise<GmailToken> {
    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials(token);

    const { credentials } = await oauth2Client.refreshAccessToken();

    return {
      access_token: credentials.access_token ?? token.access_token,
      refresh_token: credentials.refresh_token ?? token.refresh_token,
      scope: credentials.scope ?? token.scope,
      token_type: credentials.token_type ?? token.token_type,
      expiry_date: credentials.expiry_date ?? Date.now() + 3600 * 1000,
    };
  }

  async getAuthenticatedClient(tokenPath: string): Promise<Auth.OAuth2Client> {
    let token = await this.loadToken(tokenPath);

    if (!token) {
      throw new Error(`Token not found at ${tokenPath}. Run 'npm run setup' first.`);
    }

    const oauth2Client = this.getOAuth2Client();

    // Check if token needs refresh
    if (token.expiry_date && token.expiry_date < Date.now() + 60000) {
      token = await this.refreshToken(token);
      await this.saveToken(tokenPath, token);
    }

    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  async authenticate(accountName: string, tokenPath: string): Promise<GmailToken> {
    const authUrl = this.getAuthUrl();

    console.log(`\nAuthorization required for account: ${accountName}`);
    console.log(`\nPlease visit this URL to authorize the application:\n`);
    console.log(authUrl);
    console.log(`\nWaiting for authorization...`);

    const code = await this.waitForAuthorizationCode();
    const token = await this.exchangeCodeForToken(code);
    await this.saveToken(tokenPath, token);

    console.log(`\nToken saved to: ${tokenPath}`);
    return token;
  }

  private waitForAuthorizationCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }

        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400);
          res.end(`Authorization failed: ${error}`);
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);
          server.close();
          resolve(code);
        } else {
          res.writeHead(400);
          res.end('Missing authorization code');
        }
      });

      server.listen(REDIRECT_PORT, () => {
        console.log(`Listening for authorization callback on port ${REDIRECT_PORT}...`);
      });

      server.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          reject(new Error(`Port ${REDIRECT_PORT} is already in use. Please close any other applications using this port.`));
        } else {
          reject(err);
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authorization timed out'));
      }, 5 * 60 * 1000);
    });
  }
}
