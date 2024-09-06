import BridgeApiClient from "../lib/BridgeApiClient";
import { getThemeData } from "./settingsHelper";

export async function getServerSideProps(context) {

    context.res.setHeader(
        'Cache-Control',
        's-maxage=60, stale-while-revalidate'
    );

    var apiClient = new BridgeApiClient();
    const { data: settings } = await apiClient.GetSettingsAsync()
    const themeData = await getThemeData(context.query)

    return {
        props: { settings, themeData }
    }
}