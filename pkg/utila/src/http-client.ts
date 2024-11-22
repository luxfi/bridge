import * as jwt from 'jsonwebtoken';

interface HttpClientOptions {
  baseUrl: string;
  email: string;
  privateKey: () => Promise<string>;
}

class HttpClient {
  private pk = '';

  constructor(private options: HttpClientOptions) {}

  async get(path: string) {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: 'GET',
      headers: await this.buildCommonHeaders(),
    });

    return res.json();
  }

  async post(path: string, body: Record<string, unknown>) {
    const url = `${this.options.baseUrl}${path}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: await this.buildCommonHeaders(),
      body: JSON.stringify(body),
    });

    return res.json();
  }

  private async buildCommonHeaders() {
    return {
      Authorization: `Bearer ${await this.getToken()}`,
      'Content-Type': 'application/json',
    };
  }

  private async getToken() {
    const options = {
      subject: this.options.email,
      audience: 'https://api.utila.io/',
      expiresIn: '1h',
      algorithm: 'RS256' as const,
    };

    if (!this.pk) {
      this.pk = await this.options.privateKey();
    }

    return jwt.sign({}, this.pk, options);
  }
}

export function createHttpClient(options: {
  baseUrl: string;
  email: string;
  privateKey: () => Promise<string>;
}) {
  return new HttpClient(options);
}
