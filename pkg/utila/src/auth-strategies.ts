import { Interceptor } from '@connectrpc/connect';
import * as jwt from 'jsonwebtoken';

export function serviceAccountAuthStrategy({
  email,
  privateKey,
}: {
  email: string;
  privateKey: () => Promise<string>;
}) {
  const options = {
    subject: email,
    audience: 'https://api.utila.io/',
    expiresIn: '1h',
    algorithm: 'RS256' as const,
  };

  let pk = '';
  const authInterceptor: Interceptor = (next) => async (req) => {
    if (!pk) {
      pk = await privateKey();
    }

    const sig = jwt.sign({}, pk, options);

    req.header.append('Authorization', `Bearer ${sig}`);

    return await next(req);
  };

  return authInterceptor;
}

export function jwtAuthStrategy(jwt: string) {
  const authInterceptor: Interceptor = (next) => async (req) => {
    req.header.append('Authorization', `Bearer ${jwt}`);

    return await next(req);
  };

  return authInterceptor;
}
