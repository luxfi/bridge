export default function upperCaseKeys(obj: object) {
    return Object.keys(obj).reduce((accumulator: any, key) => {
        accumulator[key.toUpperCase()] = (obj as any)[key];
        return accumulator;
    }, {});
}