export default function upperCaseKeys(obj: any) {
    return Object.keys(obj).reduce((accumulator: any, key: string) => {
        accumulator[key.toUpperCase()] = obj[key];
        return accumulator;
    }, {});
}