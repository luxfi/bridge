type Status = 'active' | 'inactive';
interface ExchangeAsset {
    asset: string;
    is_default: boolean;
    network: string;
    status: Status;
}
interface Exchange {
    display_name: string;
    internal_name: string;
    is_featured: boolean;
    type: "cex" | "fiat";
    status: Status;
    created_date: string;
    currencies: ExchangeAsset[];
    metadata?: {} | null;
    img_url?: string;
}
export { type Exchange as default };
//# sourceMappingURL=exchange.d.ts.map