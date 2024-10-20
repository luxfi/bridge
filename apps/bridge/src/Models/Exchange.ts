export type Exchange = {
    display_name: string;
    internal_name: string;
    is_featured: boolean;
    type: "cex" | "fiat";
    created_date: string;
    currencies: {
        asset: string,
        is_default: boolean,
        network: string,
        status: string
    } [];
    metadata: ExchangeMetadata | null | undefined;
    o_auth: {
        connect_url: string,
        authorize_url: string
    } | null
    img_url?: string
}

export type ExchangeMetadata = {}