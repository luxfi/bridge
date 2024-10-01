exports.id=418,exports.ids=[418],exports.modules={1082:(e,t,s)=>{Promise.resolve().then(s.bind(s,4503)),Promise.resolve().then(s.bind(s,2316)),Promise.resolve().then(s.t.bind(s,2595,23)),Promise.resolve().then(s.t.bind(s,6943,23))},5345:(e,t,s)=>{Promise.resolve().then(s.bind(s,669)),Promise.resolve().then(s.bind(s,5299)),Promise.resolve().then(s.bind(s,906)),Promise.resolve().then(s.bind(s,8564)),Promise.resolve().then(s.bind(s,40)),Promise.resolve().then(s.bind(s,4621)),Promise.resolve().then(s.bind(s,4418)),Promise.resolve().then(s.bind(s,1875)),Promise.resolve().then(s.bind(s,6275)),Promise.resolve().then(s.bind(s,7358)),Promise.resolve().then(s.bind(s,1126)),Promise.resolve().then(s.bind(s,5)),Promise.resolve().then(s.bind(s,724)),Promise.resolve().then(s.t.bind(s,2595,23)),Promise.resolve().then(s.bind(s,9945))},3055:(e,t,s)=>{Promise.resolve().then(s.t.bind(s,1215,23)),Promise.resolve().then(s.t.bind(s,2699,23)),Promise.resolve().then(s.t.bind(s,7774,23)),Promise.resolve().then(s.t.bind(s,255,23)),Promise.resolve().then(s.t.bind(s,2617,23)),Promise.resolve().then(s.t.bind(s,6163,23))},4503:(e,t,s)=>{"use strict";s.r(t),s.d(t,{default:()=>x});var r=s(609);s(9566);var i=s(8759),n=s(5386),a=s(9411),l=s(6590),o=s(3257),c=s(2846);let d=process.env.NEXT_PUBLIC_APP_BASE_PATH,x=()=>{let e=(0,i.usePathname)();return r.jsx("header",{className:"max-w-6xl w-full mx-auto",children:(0,r.jsxs)("nav",{className:"mx-auto max-w-6xl flex flex-row items-center py-6 px-6","aria-label":"Global",children:[r.jsx(l.TR,{className:"p-1.5 "}),r.jsx("div",{className:"max-w-2xl w-full mx-auto ",children:!("/"===e||e===d||e===`${d}/`)&&r.jsx(c.default,{className:"w-full px-6"})}),(0,r.jsxs)("div",{className:"flex gap-x-2 sm:gap-x-4  justify-self-end",children:[r.jsx(o.EA,{def:{variant:"outline",size:"default",title:"Bridge App",icon:r.jsx(n.Z,{className:"h-4 w-4"}),href:"https://bridge.lux.network"},className:"lg:min-w-0 gap-1"}),r.jsx(o.EA,{def:{variant:"outline",size:"default",title:"Docs",icon:r.jsx(a.Z,{className:"h-4 w-4"}),href:"https://docs.bridge.lux.network"},className:"lg:min-w-0 gap-1"})]})]})})}},2846:(e,t,s)=>{"use strict";s.r(t),s.d(t,{default:()=>o});var r=s(609),i=s(6790),n=s(8759),a=s(9566),l=s(3257);let o=({className:e})=>{let[t,s]=(0,a.useState)(""),o=(0,n.useRouter)(),c=()=>{let e=t.split("/").at(-1);o.push(`/${e}`)};return r.jsx("div",{className:e??"",children:(0,r.jsxs)("div",{className:"relative flex flex-row items-center pl-2 border border-muted-3 rounded-md",children:[r.jsx("input",{type:"text",name:"searchParam",id:"searchParam",value:t,onChange:e=>s(e.target.value),onKeyDown:e=>{"Enter"===e.key&&c()},placeholder:"Search by Address / Source Tx / Destination Tx",className:"block w-full rounded-md py-1 pl-3 pr-4 duration-200 transition-all outline-none placeholder:text-muted placeholder:text-base placeholder:leading-3text-foreground bg-background"}),r.jsx(l.zx,{variant:"primary",onClick:c,className:"inline-flex flex-row items-center align-center aspect-square lg:min-w-0 p-0 m-2",children:r.jsx(i.Z,{size:18})})]})})}},2316:(e,t,s)=>{"use strict";s.r(t),s.d(t,{SettingsProvider:()=>d,useSettingsState:()=>x});var r=s(609),i=s(7658);class n{constructor(e){this.resolveImgSrc=e=>{if(!e)return"/assets/img/logo_placeholder.png";let t=process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL;if(!t)throw Error("NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars");let s=new URL(t);return e?.internal_name!=void 0?s.pathname=`/bridge/networks/${e?.internal_name?.toLowerCase()}.png`:e?.asset!=void 0&&(s.pathname=`/bridge/currencies/${e?.asset?.toLowerCase()}.png`),console.log("=====>",s.href),s.href},this.layers=n.ResolveLayers(e.networks),this.exchanges=e.exchanges}static ResolveLayers(e){let t=process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL;if(!t)throw Error("NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars");let s=new URL(t);return e?.map(e=>({isExchange:!1,assets:n.ResolveNetworkL2Assets(e),img_url:`${s}bridge/networks/${e?.internal_name?.toLowerCase()}.png`,...e}))}static ResolveNetworkL2Assets(e){return e?.currencies?.map(e=>({asset:e.asset,status:e.status,contract_address:e.contract_address,decimals:e.decimals,precision:e.precision,price_in_usd:e.price_in_usd,is_native:e.is_native,is_refuel_enabled:e.is_refuel_enabled}))}}var a=s(9566),l=s.n(a),o=s(5676);let c=l().createContext(null),d=({children:e})=>{let t=e=>fetch(e).then(e=>e.json()),s="sandbox",{data:a}=(0,o.ZP)(`${i.Z.BridgeApiUri}/api/networks?version=${s}`,t,{dedupingInterval:6e4}),{data:l}=(0,o.ZP)(`${i.Z.BridgeApiUri}/api/exchanges?version=${s}`,t,{dedupingInterval:6e4}),d=new n({networks:a?.data,exchanges:l?.data});return r.jsx(c.Provider,{value:d,children:e})};function x(){let e=l().useContext(c);if(void 0===e)throw Error("useSettingsState must be used within a SettingsProvider");return e}},7658:(e,t,s)=>{"use strict";s.d(t,{Z:()=>r});class r{static{this.BridgeApiUri=process.env.NEXT_PUBLIC_BRIDGE_API}static{this.ApiVersion=process.env.NEXT_PUBLIC_API_VERSION||"mainnet"}}},6319:(e,t,s)=>{"use strict";s.r(t),s.d(t,{default:()=>b,metadata:()=>f});var r=s(614);s(1045);var i=s(8337),n=s(9319),a=s(4015);let l=(0,a.createProxy)(String.raw`E:\work\hanzo-ai\jackson\lux_bridge_0.0.0\explorer\components\Header.tsx`),{__esModule:o,$$typeof:c}=l,d=l.default;var x=s(9136);let h={social:[{name:"Twitter",href:"https://twitter.com/luxfi",icon:e=>r.jsx("svg",{fill:"currentColor",viewBox:"0 0 24 24",...e,children:r.jsx("path",{d:"M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"})})},{name:"Discord",href:"https://chat.lux.network",icon:e=>(0,r.jsxs)("svg",{...e,"aria-hidden":"true",viewBox:"0 0 71 55",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:[r.jsx("g",{clipPath:"url(#clip0)",children:r.jsx("path",{d:"M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z",fill:"currentColor"})}),r.jsx("defs",{children:r.jsx("clipPath",{id:"clip0",children:r.jsx("rect",{width:"71",height:"55",fill:"white"})})})]})},{name:"GitHub",href:"https://github.com/luxfi",icon:e=>r.jsx("svg",{fill:"currentColor",viewBox:"0 0 24 24",...e,children:r.jsx("path",{fillRule:"evenodd",d:"M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",clipRule:"evenodd"})})},{name:"YouTube",href:"https://www.youtube.com/@luxfi",icon:e=>r.jsx("svg",{fill:"currentColor",viewBox:"0 0 24 24",...e,children:r.jsx("path",{fillRule:"evenodd",d:"M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768c-1.56.419-7.814.419-7.814.419s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 11.998 5 11.998 5s6.255 0 7.814.418ZM15.194 12 10 15V9l5.194 3Z",clipRule:"evenodd"})})}]},u=()=>(0,r.jsxs)("footer",{className:"flex flex-row justify-between text-muted-2 overflow-hidden py-6 w-full px-6 lg:px-8 mt-auto",children:[r.jsx("div",{className:"mt-3 md:mt-0",children:(0,r.jsxs)("p",{className:"text-center text-xs leading-6 cursor-default",children:["\xa9 ",new Date().getFullYear()," Lux Partners Limited. All rights reserved."]})}),(0,r.jsxs)("div",{className:"flex justify-center mt-3 md:mt-0 gap-6",children:[r.jsx(x.default,{target:"_blank",href:"https://lux.network/privacy",className:"hover:text-muted text-xs leading-6 duration-200 transition-all",children:"Privacy Policy"}),r.jsx(x.default,{target:"_blank",href:"https://lux.network/terms",className:"hover:text-muted text-xs leading-6 duration-200 transition-all",children:"Terms of Services"})]}),r.jsx("div",{className:"flex justify-center space-x-6",children:h.social.map(e=>(0,r.jsxs)(x.default,{target:"_blank",href:e.href,className:"hover:text-muted",children:[r.jsx("span",{className:"sr-only",children:e.name}),r.jsx(e.icon,{className:"h-6 w-6","aria-hidden":"true"})]},e.name))})]}),m=(0,a.createProxy)(String.raw`E:\work\hanzo-ai\jackson\lux_bridge_0.0.0\explorer\context\settings.tsx`),{__esModule:p,$$typeof:g}=m;m.default;let v=(0,a.createProxy)(String.raw`E:\work\hanzo-ai\jackson\lux_bridge_0.0.0\explorer\context\settings.tsx#SettingsProvider`);(0,a.createProxy)(String.raw`E:\work\hanzo-ai\jackson\lux_bridge_0.0.0\explorer\context\settings.tsx#useSettingsState`),s(7627);let f={metadataBase:new URL("https://explorer.bridge.lux.network"),title:{default:"Lux Bridge Explorer",template:"%s | Explorer"},description:"Explore your swaps",applicationName:"Lux Bridge Explorer",authors:{name:"Lux Dev team"},keywords:"Lux Network, Blockchain Bridge, Multi-Chain, EVM, Solana, Bitcoin, Cross-Chain, Interoperability, Cryptocurrency, Blockchain Technology",icons:[{rel:"icon",type:"image/png",sizes:"16x16",url:"/assets/lux-site-icons/favicon-16x16.png"},{rel:"icon",type:"image/png",sizes:"32x32",url:"/assets/lux-site-icons/favicon-32x32.png"},{rel:"icon",type:"image/png",sizes:"192x192",url:"/assets/lux-site-icons/android-chrome-192x192.png"},{rel:"icon",type:"image/png",sizes:"512x512",url:"/assets/lux-site-icons/android-chrome-512x512.png"},{rel:"apple-touch-icon",type:"image/png",sizes:"180x180",url:"/assets/lux-site-icons/apple-touch-icon.png"}],manifest:"/site.webmanifest",openGraph:{title:"Lux Bridge Explorer - Explore your swaps",description:"Connect across EVM, Solana, Bitcoin, and other blockchains with Lux Network's advanced bridge technology. Experience secure and efficient cross-chain functionality.",images:"https://explorer.bridge.lux.network/assets/img/opengraph-lux.jpg",type:"website",url:"https://explorer.bridge.lux.network"},twitter:{card:"summary_large_image",title:"Lux Bridge Explorer - Explore your swaps",description:"Experience seamless multi-chain connectivity with Lux Network's Blockchain Bridge. EVM, Solana, Bitcoin, and more, united.",images:"https://explorer.bridge.lux.network/assets/img/opengraph-lux.jpg",site:"@luxdefi"},formatDetection:{telephone:!1},other:{"msapplication-TileColor":"#000000"}},w="bg-background text-foreground flex min-h-screen flex-col items-center max-w-6xl mx-auto "+(0,n.Z)(),b=({children:e})=>r.jsx(v,{children:(0,r.jsxs)("html",{lang:"en",className:"lux-dark-theme",children:[r.jsx(i.default,{defer:!0,"data-domain":"bridge.lux.network",src:"https://plausible.io/js/script.js"}),(0,r.jsxs)("body",{className:w,children:[r.jsx(d,{}),e,r.jsx(u,{})]})]})})},4456:(e,t,s)=>{"use strict";s.r(t),s.d(t,{default:()=>l});var r=s(614);s(1045);var i=s(3032),n=s(6966),a=s(1079);let l=()=>r.jsx("main",{className:"grid min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8",children:(0,r.jsxs)("div",{className:"text-center",children:[r.jsx("h1",{className:"mt-4 mb-3 text-3xl font-bold tracking-tight  sm:text-5xl",children:"Page not found"}),r.jsx("p",{className:"text-lg font-semibold",children:"(404)"}),r.jsx("p",{className:"mt-6 text-lg leading-7",children:"Sorry, we couldn’t find the page you’re looking for."}),(0,r.jsxs)("div",{className:"mt-10 flex items-center justify-center gap-x-4",children:[r.jsx(a.EA,{def:{href:"/",title:"Back to main page",icon:r.jsx(i.Z,{className:"mr-2 h-4 w-4"}),variant:"ghost",size:"lg"},className:"text-base"}),r.jsx(a.EA,{def:{href:"https://help.lux.network",title:"Contact support",icon:r.jsx(n.Z,{className:"ml-2 h-4 w-4"}),iconAfter:!0,variant:"ghost",size:"lg"},className:"text-base"})]})]})})},7627:()=>{}};