type AuthGetCodeResponse = {
    data: {
        next: Date,
        already_sent: boolean
    };
    error: string;
}

type AuthConnectResponse = {
    access_token: string;
    expires_in: number;
    token_type: string;
    refresh_token: string;
    scope: string;
}

export {
  type AuthGetCodeResponse,
  type AuthConnectResponse
}