import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

interface FireblocksConfig {
  apiKey: string;
  apiSecretPath: string;
  baseUrl: string;
  publicKey: string;
}

export function getFireblocksConfig(): FireblocksConfig {
  const isTestnet = process.env.NEXT_PUBLIC_API_VERSION === 'testnet';

  return {
    apiKey: isTestnet
      ? process.env.FIREBLOCKS_TESTNET_API_KEY!
      : process.env.FIREBLOCKS_MAINNET_API_KEY!,
    apiSecretPath: isTestnet
      ? process.env.FIREBLOCKS_TESTNET_API_SECRET_PATH!
      : process.env.FIREBLOCKS_MAINNET_API_SECRET_PATH!,
    baseUrl: isTestnet
      ? 'https://api.fireblocks.io/sandbox'
      : 'https://api.fireblocks.io',
    publicKey: isTestnet ? FIREBLOCKS_SANDBOX_PUBLIC_KEY : FIREBLOCKS_PRODUCTION_PUBLIC_KEY,
  };
}

// Hard-coded Fireblocks public keys
const FIREBLOCKS_PRODUCTION_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA0+6wd9OJQpK60ZI7qnZG
jjQ0wNFUHfRv85Tdyek8+ahlg1Ph8uhwl4N6DZw5LwLXhNjzAbQ8LGPxt36RUZl5
YlxTru0jZNKx5lslR+H4i936A4pKBjgiMmSkVwXD9HcfKHTp70GQ812+J0Fvti/v
4nrrUpc011Wo4F6omt1QcYsi4GTI5OsEbeKQ24BtUd6Z1Nm/EP7PfPxeb4CP8KOH
clM8K7OwBUfWrip8Ptljjz9BNOZUF94iyjJ/BIzGJjyCntho64ehpUYP8UJykLVd
CGcu7sVYWnknf1ZGLuqqZQt4qt7cUUhFGielssZP9N9x7wzaAIFcT3yQ+ELDu1SZ
dE4lZsf2uMyfj58V8GDOLLE233+LRsRbJ083x+e2mW5BdAGtGgQBusFfnmv5Bxqd
HgS55hsna5725/44tvxll261TgQvjGrTxwe7e5Ia3d2Syc+e89mXQaI/+cZnylNP
SwCCvx8mOM847T0XkVRX3ZrwXtHIA25uKsPJzUtksDnAowB91j7RJkjXxJcz3Vh1
4k182UFOTPRW9jzdWNSyWQGl/vpe9oQ4c2Ly15+/toBo4YXJeDdDnZ5c/O+KKadc
IMPBpnPrH/0O97uMPuED+nI6ISGOTMLZo35xJ96gPBwyG5s2QxIkKPXIrhgcgUnk
tSM7QYNhlftT4/yVvYnk0YcCAwEAAQ==
-----END PUBLIC KEY-----`;

const FIREBLOCKS_SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw+fZuC+0vDYTf8fYnCN6
71iHg98lPHBmafmqZqb+TUexn9sH6qNIBZ5SgYFxFK6dYXIuJ5uoORzihREvZVZP
8DphdeKOMUrMr6b+Cchb2qS8qz8WS7xtyLU9GnBn6M5mWfjkjQr1jbilH15Zvcpz
ECC8aPUAy2EbHpnr10if2IHkIAWLYD+0khpCjpWtsfuX+LxqzlqQVW9xc6z7tshK
eCSEa6Oh8+ia7Zlu0b+2xmy2Arb6xGl+s+Rnof4lsq9tZS6f03huc+XVTmd6H2We
WxFMfGyDCX2akEg2aAvx7231/6S0vBFGiX0C+3GbXlieHDplLGoODHUt5hxbPJnK
IwIDAQAB
-----END PUBLIC KEY-----`;

export function signRequest(method: string, urlPath: string, body: string) {
  const { apiSecretPath } = getFireblocksConfig();
  const apiSecret = fs.readFileSync(path.resolve(apiSecretPath), 'utf8');

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const requestString = `${timestamp}${nonce}${method.toUpperCase()}${urlPath}${body}`;

  const signature = crypto
    .createSign('sha256')
    .update(requestString)
    .sign(apiSecret, 'base64');

  return { timestamp, nonce, signature };
}

export async function fireblocksApiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  pathUrl: string,
  body: any = {}
) {
  const { apiKey, baseUrl } = getFireblocksConfig();
  const bodyString = Object.keys(body).length > 0 ? JSON.stringify(body) : '';

  const { timestamp, nonce, signature } = signRequest(method, pathUrl, bodyString);

  const headers = {
    'X-API-Key': apiKey,
    'X-API-Sign': signature,
    'X-API-Timestamp': timestamp,
    'X-API-Nonce': nonce,
    'Content-Type': 'application/json',
  };

  const response = await axios({
    method,
    url: `${baseUrl}${pathUrl}`,
    headers,
    data: bodyString ? JSON.parse(bodyString) : undefined,
  });

  return response.data;
}

export function verifyWebhookSignature(body: string, signature: string) {
  const { publicKey } = getFireblocksConfig();
  const verifier = crypto.createVerify('RSA-SHA512');
  verifier.update(body);
  verifier.end();

  return verifier.verify(publicKey.replace(/\\n/g, '\n'), signature, 'base64');
}
