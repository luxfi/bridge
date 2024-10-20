export default function inIframe () {
    try {
        return window.self !== window.top;
    } catch( e: any ) {
        return true;
    }
}