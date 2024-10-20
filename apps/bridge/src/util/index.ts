/**
 * resolve network image url
 * @param intenalName
 * @returns
 */
export const resolveNetworkImage = (intenalName: string) => {
  return (
    process.env.NEXT_PUBLIC_CDN_URL +
    `/bridge/networks/${intenalName.toLowerCase()}.png`
  );
};

/**
 * resolve currency image url
 * @param asset
 * @returns
 */
export const resolveCurrencyImage = (asset: string) => {
  return (
    process.env.NEXT_PUBLIC_CDN_URL +
    `/bridge/currencies/${asset.toLowerCase()}.png`
  );
};
