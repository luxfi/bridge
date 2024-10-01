"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[796],{6080:function(e,t,n){n.d(t,{zx:function(){return s},EA:function(){return d}}),n(4286);var r=n(8315),i=n(4110),o=n(6829),a=n(1317);n.n(a)()(()=>Promise.resolve().then(n.bind(n,1402)),{loadableGenerated:{webpack:()=>[1402]},ssr:!1});var u=n(8690);let l=(0,n(9374).j)("flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",{variants:{variant:{primary:"bg-primary-lux text-primary-fg hover:bg-primary-hover font-heading whitespace-nowrap not-typography",secondary:"bg-secondary-lux text-secondary-fg hover:bg-secondary/80 font-heading whitespace-nowrap not-typography",outline:"text-foreground border border-muted-4 hover:bg-level-1 hover:text-accent hover:border-accent font-heading whitespace-nowrap not-typography",destructive:"bg-destructive text-destructive-fg font-sans whitespace-nowrap hover:bg-destructive-hover",ghost:"text-foreground hover:bg-level-1 hover:text-accent whitespace-nowrap font-sans ",link:"text-foreground hover:text-muted-1 font-sans ",linkFG:"text-foreground hover:text-muted-1 font-sans "},size:{link:"",sm:"h-9 px-3 text-xs ",square:"h-10 py-2 px-2 text-sm aspect-square",default:"h-10 py-2 px-4 text-sm lg:min-w-[220px]",lg:"h-10 px-8 text-base rounded-lg min-w-[260px] lg:min-w-[300px] lg:h-10 xs:min-w-0 xs:text-sm",icon:"h-10 w-10"}},defaultVariants:{variant:"primary",size:"default"}}),s=i.forwardRef((e,t)=>{let{className:n,variant:i,size:a,asChild:s=!1,...c}=e,d=s?u.g7:"button";return(0,r.jsx)(d,{className:(0,o.cn)(l({variant:i,size:a,className:n})),ref:t,...c})});s.displayName="Button",n(4868),n(1402),n(3834),n(1114),n(5080),n(9385),n(9778);var c=n(7016),d=e=>{let{def:t,className:n="",size:i,onClick:a,variant:u,icon:s,iconAfter:d}=e,{href:f,external:h,newTab:g,variant:p,size:v,title:m}=t,y={...f?{href:f}:{href:"#"},...h?{rel:"noreferrer",target:void 0!==g&&!1===g?"_self":"_blank"}:{target:void 0!==g&&!0===g?"_blank":"_self"},...a?{onClick:a}:{}},b=s||(t.icon?t.icon:void 0),w=d||!!t.iconAfter&&t.iconAfter;return(0,r.jsxs)(c.default,{className:(0,o.cn)(l({variant:u||p||"link",size:!p||p.includes("link")||(null==u?void 0:u.includes("link"))?"link":i||v}),f||a?"":"pointer-events-none",n),...y,children:[b&&!w&&(0,r.jsx)("div",{className:"pr-1",children:b}),(0,r.jsx)("div",{children:m}),b&&w&&(0,r.jsx)("div",{className:"pl-1",children:b})]})};n(8730),n(3143),n(1677),n(2131),n(3733),n(3379)},7016:function(e,t,n){n.d(t,{default:function(){return i.a}});var r=n(5372),i=n.n(r)},6728:function(e,t,n){var r=n(7559);n.o(r,"usePathname")&&n.d(t,{usePathname:function(){return r.usePathname}}),n.o(r,"useRouter")&&n.d(t,{useRouter:function(){return r.useRouter}})},1317:function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"default",{enumerable:!0,get:function(){return o}});let r=n(6508);n(8315),n(4110);let i=r._(n(660));function o(e,t){let n={loading:e=>{let{error:t,isLoading:n,pastDelay:r}=e;return null}};return"function"==typeof e&&(n.loader=e),(0,i.default)({...n,...t})}("function"==typeof t.default||"object"==typeof t.default&&null!==t.default)&&void 0===t.default.__esModule&&(Object.defineProperty(t.default,"__esModule",{value:!0}),Object.assign(t.default,t),e.exports=t.default)},660:function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"default",{enumerable:!0,get:function(){return l}});let r=n(8315),i=n(4110),o=n(3510);function a(e){var t;return{default:null!=(t=null==e?void 0:e.default)?t:e}}let u={loader:()=>Promise.resolve(a(()=>null)),loading:null,ssr:!0},l=function(e){let t={...u,...e},n=(0,i.lazy)(()=>t.loader().then(a)),l=t.loading;function s(e){let a=l?(0,r.jsx)(l,{isLoading:!0,pastDelay:!0,error:null}):null,u=t.ssr?(0,r.jsx)(n,{...e}):(0,r.jsx)(o.BailoutToCSR,{reason:"next/dynamic",children:(0,r.jsx)(n,{...e})});return(0,r.jsx)(i.Suspense,{fallback:a,children:u})}return s.displayName="LoadableComponent",s}},6924:function(e){var t,n,r,i=e.exports={};function o(){throw Error("setTimeout has not been defined")}function a(){throw Error("clearTimeout has not been defined")}function u(e){if(t===setTimeout)return setTimeout(e,0);if((t===o||!t)&&setTimeout)return t=setTimeout,setTimeout(e,0);try{return t(e,0)}catch(n){try{return t.call(null,e,0)}catch(n){return t.call(this,e,0)}}}!function(){try{t="function"==typeof setTimeout?setTimeout:o}catch(e){t=o}try{n="function"==typeof clearTimeout?clearTimeout:a}catch(e){n=a}}();var l=[],s=!1,c=-1;function d(){s&&r&&(s=!1,r.length?l=r.concat(l):c=-1,l.length&&f())}function f(){if(!s){var e=u(d);s=!0;for(var t=l.length;t;){for(r=l,l=[];++c<t;)r&&r[c].run();c=-1,t=l.length}r=null,s=!1,function(e){if(n===clearTimeout)return clearTimeout(e);if((n===a||!n)&&clearTimeout)return n=clearTimeout,clearTimeout(e);try{n(e)}catch(t){try{return n.call(null,e)}catch(t){return n.call(this,e)}}}(e)}}function h(e,t){this.fun=e,this.array=t}function g(){}i.nextTick=function(e){var t=Array(arguments.length-1);if(arguments.length>1)for(var n=1;n<arguments.length;n++)t[n-1]=arguments[n];l.push(new h(e,t)),1!==l.length||s||u(f)},h.prototype.run=function(){this.fun.apply(null,this.array)},i.title="browser",i.browser=!0,i.env={},i.argv=[],i.version="",i.versions={},i.on=g,i.addListener=g,i.once=g,i.off=g,i.removeListener=g,i.removeAllListeners=g,i.emit=g,i.prependListener=g,i.prependOnceListener=g,i.listeners=function(e){return[]},i.binding=function(e){throw Error("process.binding is not supported")},i.cwd=function(){return"/"},i.chdir=function(e){throw Error("process.chdir is not supported")},i.umask=function(){return 0}},9770:function(e,t,n){/**
 * @license React
 * use-sync-external-store-shim.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var r=n(4110),i="function"==typeof Object.is?Object.is:function(e,t){return e===t&&(0!==e||1/e==1/t)||e!=e&&t!=t},o=r.useState,a=r.useEffect,u=r.useLayoutEffect,l=r.useDebugValue;function s(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!i(e,n)}catch(e){return!0}}var c=void 0===window.document||void 0===window.document.createElement?function(e,t){return t()}:function(e,t){var n=t(),r=o({inst:{value:n,getSnapshot:t}}),i=r[0].inst,c=r[1];return u(function(){i.value=n,i.getSnapshot=t,s(i)&&c({inst:i})},[e,n,t]),a(function(){return s(i)&&c({inst:i}),e(function(){s(i)&&c({inst:i})})},[e]),l(n),n};t.useSyncExternalStore=void 0!==r.useSyncExternalStore?r.useSyncExternalStore:c},7915:function(e,t,n){e.exports=n(9770)},7050:function(e,t,n){n.d(t,{ZP:function(){return Y}});var r,i=n(4110),o=n(7915);let a=()=>{},u=a(),l=Object,s=e=>e===u,c=e=>"function"==typeof e,d=(e,t)=>({...e,...t}),f=e=>c(e.then),h=new WeakMap,g=0,p=e=>{let t,n;let r=typeof e,i=e&&e.constructor,o=i==Date;if(l(e)!==e||o||i==RegExp)t=o?e.toJSON():"symbol"==r?e.toString():"string"==r?JSON.stringify(e):""+e;else{if(t=h.get(e))return t;if(t=++g+"~",h.set(e,t),i==Array){for(n=0,t="@";n<e.length;n++)t+=p(e[n])+",";h.set(e,t)}if(i==l){t="#";let r=l.keys(e).sort();for(;!s(n=r.pop());)s(e[n])||(t+=n+":"+p(e[n])+",");h.set(e,t)}}return t},v=new WeakMap,m={},y={},b="undefined",w=typeof document!=b,E=()=>typeof window.requestAnimationFrame!=b,_=(e,t)=>{let n=v.get(e);return[()=>!s(t)&&e.get(t)||m,r=>{if(!s(t)){let i=e.get(t);t in y||(y[t]=i),n[5](t,d(i,r),i||m)}},n[6],()=>!s(t)&&t in y?y[t]:!s(t)&&e.get(t)||m]},x=!0,[T,R]=window.addEventListener?[window.addEventListener.bind(window),window.removeEventListener.bind(window)]:[a,a],O={initFocus:e=>(w&&document.addEventListener("visibilitychange",e),T("focus",e),()=>{w&&document.removeEventListener("visibilitychange",e),R("focus",e)}),initReconnect:e=>{let t=()=>{x=!0,e()},n=()=>{x=!1};return T("online",t),T("offline",n),()=>{R("online",t),R("offline",n)}}},k=!i.useId,S="Deno"in window,L=e=>E()?window.requestAnimationFrame(e):setTimeout(e,1),V=S?i.useEffect:i.useLayoutEffect,j="undefined"!=typeof navigator&&navigator.connection,A=!S&&j&&(["slow-2g","2g"].includes(j.effectiveType)||j.saveData),C=e=>{if(c(e))try{e=e()}catch(t){e=""}let t=e;return[e="string"==typeof e?e:(Array.isArray(e)?e.length:e)?p(e):"",t]},N=0,P=()=>++N;var D={ERROR_REVALIDATE_EVENT:3,FOCUS_EVENT:0,MUTATE_EVENT:2,RECONNECT_EVENT:1};async function M(){for(var e=arguments.length,t=Array(e),n=0;n<e;n++)t[n]=arguments[n];let[r,i,o,a]=t,l=d({populateCache:!0,throwOnError:!0},"boolean"==typeof a?{revalidate:a}:a||{}),h=l.populateCache,g=l.rollbackOnError,p=l.optimisticData,m=!1!==l.revalidate,y=e=>"function"==typeof g?g(e):!1!==g,b=l.throwOnError;if(c(i)){let e=[];for(let t of r.keys())!/^\$(inf|sub)\$/.test(t)&&i(r.get(t)._k)&&e.push(t);return Promise.all(e.map(w))}return w(i);async function w(e){let n;let[i]=C(e);if(!i)return;let[a,l]=_(r,i),[d,g,w,E]=v.get(r),x=()=>{let e=d[i];return m&&(delete w[i],delete E[i],e&&e[0])?e[0](2).then(()=>a().data):a().data};if(t.length<3)return x();let T=o,R=P();g[i]=[R,0];let O=!s(p),k=a(),S=k.data,L=k._c,V=s(L)?S:L;if(O&&l({data:p=c(p)?p(V,S):p,_c:V}),c(T))try{T=T(V)}catch(e){n=e}if(T&&f(T)){if(T=await T.catch(e=>{n=e}),R!==g[i][0]){if(n)throw n;return T}n&&O&&y(n)&&(h=!0,l({data:V,_c:u}))}if(h&&!n&&(c(h)?l({data:h(T,V),error:u,_c:u}):l({data:T,error:u,_c:u})),g[i][1]=P(),Promise.resolve(x()).then(()=>{l({_c:u})}),n){if(b)throw n;return}return T}}let I=(e,t)=>{for(let n in e)e[n][0]&&e[n][0](t)},F=(e,t)=>{if(!v.has(e)){let n=d(O,t),r={},i=M.bind(u,e),o=a,l={},s=(e,t)=>{let n=l[e]||[];return l[e]=n,n.push(t),()=>n.splice(n.indexOf(t),1)},c=(t,n,r)=>{e.set(t,n);let i=l[t];if(i)for(let e of i)e(n,r)},f=()=>{if(!v.has(e)&&(v.set(e,[r,{},{},{},i,c,s]),!S)){let t=n.initFocus(setTimeout.bind(u,I.bind(u,r,0))),i=n.initReconnect(setTimeout.bind(u,I.bind(u,r,1)));o=()=>{t&&t(),i&&i(),v.delete(e)}}};return f(),[e,i,f,o]}return[e,v.get(e)[4]]},[z,U]=F(new Map),W=d({onLoadingSlow:a,onSuccess:a,onError:a,onErrorRetry:(e,t,n,r,i)=>{let o=n.errorRetryCount,a=i.retryCount,u=~~((Math.random()+.5)*(1<<(a<8?a:8)))*n.errorRetryInterval;(s(o)||!(a>o))&&setTimeout(r,u,i)},onDiscarded:a,revalidateOnFocus:!0,revalidateOnReconnect:!0,revalidateIfStale:!0,shouldRetryOnError:!0,errorRetryInterval:A?1e4:5e3,focusThrottleInterval:5e3,dedupingInterval:2e3,loadingTimeout:A?5e3:3e3,compare:(e,t)=>p(e)==p(t),isPaused:()=>!1,cache:z,mutate:U,fallback:{}},{isOnline:()=>x,isVisible:()=>{let e=w&&document.visibilityState;return s(e)||"hidden"!==e}}),q=(e,t)=>{let n=d(e,t);if(t){let{use:r,fallback:i}=e,{use:o,fallback:a}=t;r&&o&&(n.use=r.concat(o)),i&&a&&(n.fallback=d(i,a))}return n},$=(0,i.createContext)({}),B=window.__SWR_DEVTOOLS_USE__,G=B?window.__SWR_DEVTOOLS_USE__:[],J=e=>c(e[1])?[e[0],e[1],e[2]||{}]:[e[0],null,(null===e[1]?e[2]:e[1])||{}],Z=()=>d(W,(0,i.useContext)($)),H=G.concat(e=>(t,n,r)=>{let i=n&&function(){for(var e=arguments.length,r=Array(e),i=0;i<e;i++)r[i]=arguments[i];let[o]=C(t),[,,,a]=v.get(z);if(o.startsWith("$inf$"))return n(...r);let u=a[o];return s(u)?n(...r):(delete a[o],u)};return e(t,i,r)}),K=(e,t,n)=>{let r=t[e]||(t[e]=[]);return r.push(n),()=>{let e=r.indexOf(n);e>=0&&(r[e]=r[r.length-1],r.pop())}};B&&(window.__SWR_DEVTOOLS_REACT__=i);let Q=i.use||(e=>{if("pending"===e.status)throw e;if("fulfilled"===e.status)return e.value;if("rejected"===e.status)throw e.reason;throw e.status="pending",e.then(t=>{e.status="fulfilled",e.value=t},t=>{e.status="rejected",e.reason=t}),e}),X={dedupe:!0};l.defineProperty(e=>{let{value:t}=e,n=(0,i.useContext)($),r=c(t),o=(0,i.useMemo)(()=>r?t(n):t,[r,n,t]),a=(0,i.useMemo)(()=>r?o:q(n,o),[r,n,o]),l=o&&o.provider,s=(0,i.useRef)(u);l&&!s.current&&(s.current=F(l(a.cache||z),o));let f=s.current;return f&&(a.cache=f[0],a.mutate=f[1]),V(()=>{if(f)return f[2]&&f[2](),f[3]},[]),(0,i.createElement)($.Provider,d(e,{value:a}))},"defaultValue",{value:W});let Y=(r=(e,t,n)=>{let{cache:r,compare:a,suspense:l,fallbackData:f,revalidateOnMount:h,revalidateIfStale:g,refreshInterval:p,refreshWhenHidden:m,refreshWhenOffline:y,keepPreviousData:b}=n,[w,E,x,T]=v.get(r),[R,O]=C(e),j=(0,i.useRef)(!1),A=(0,i.useRef)(!1),N=(0,i.useRef)(R),I=(0,i.useRef)(t),F=(0,i.useRef)(n),z=()=>F.current,U=()=>z().isVisible()&&z().isOnline(),[W,q,$,B]=_(r,R),G=(0,i.useRef)({}).current,J=s(f)?n.fallback[R]:f,Z=(e,t)=>{for(let n in G)if("data"===n){if(!a(e[n],t[n])&&(!s(e[n])||!a(ea,t[n])))return!1}else if(t[n]!==e[n])return!1;return!0},H=(0,i.useMemo)(()=>{let e=!!R&&!!t&&(s(h)?!z().isPaused()&&!l&&(!!s(g)||g):h),n=t=>{let n=d(t);return(delete n._k,e)?{isValidating:!0,isLoading:!0,...n}:n},r=W(),i=B(),o=n(r),a=r===i?o:n(i),u=o;return[()=>{let e=n(W());return Z(e,u)?(u.data=e.data,u.isLoading=e.isLoading,u.isValidating=e.isValidating,u.error=e.error,u):(u=e,e)},()=>a]},[r,R]),Y=(0,o.useSyncExternalStore)((0,i.useCallback)(e=>$(R,(t,n)=>{Z(n,t)||e()}),[r,R]),H[0],H[1]),ee=!j.current,et=w[R]&&w[R].length>0,en=Y.data,er=s(en)?J:en,ei=Y.error,eo=(0,i.useRef)(er),ea=b?s(en)?eo.current:en:er,eu=(!et||!!s(ei))&&(ee&&!s(h)?h:!z().isPaused()&&(l?!s(er)&&g:s(er)||g)),el=!!(R&&t&&ee&&eu),es=s(Y.isValidating)?el:Y.isValidating,ec=s(Y.isLoading)?el:Y.isLoading,ed=(0,i.useCallback)(async e=>{let t,r;let i=I.current;if(!R||!i||A.current||z().isPaused())return!1;let o=!0,l=e||{},d=!x[R]||!l.dedupe,f=()=>k?!A.current&&R===N.current&&j.current:R===N.current,h={isValidating:!1,isLoading:!1},g=()=>{q(h)},p=()=>{let e=x[R];e&&e[1]===r&&delete x[R]},v={isValidating:!0};s(W().data)&&(v.isLoading=!0);try{if(d&&(q(v),n.loadingTimeout&&s(W().data)&&setTimeout(()=>{o&&f()&&z().onLoadingSlow(R,n)},n.loadingTimeout),x[R]=[i(O),P()]),[t,r]=x[R],t=await t,d&&setTimeout(p,n.dedupingInterval),!x[R]||x[R][1]!==r)return d&&f()&&z().onDiscarded(R),!1;h.error=u;let e=E[R];if(!s(e)&&(r<=e[0]||r<=e[1]||0===e[1]))return g(),d&&f()&&z().onDiscarded(R),!1;let l=W().data;h.data=a(l,t)?l:t,d&&f()&&z().onSuccess(t,R,n)}catch(n){p();let e=z(),{shouldRetryOnError:t}=e;!e.isPaused()&&(h.error=n,d&&f()&&(e.onError(n,R,e),(!0===t||c(t)&&t(n))&&U()&&e.onErrorRetry(n,R,e,e=>{let t=w[R];t&&t[0]&&t[0](D.ERROR_REVALIDATE_EVENT,e)},{retryCount:(l.retryCount||0)+1,dedupe:!0})))}return o=!1,g(),!0},[R,r]),ef=(0,i.useCallback)(function(){for(var e=arguments.length,t=Array(e),n=0;n<e;n++)t[n]=arguments[n];return M(r,N.current,...t)},[]);if(V(()=>{I.current=t,F.current=n,s(en)||(eo.current=en)}),V(()=>{if(!R)return;let e=ed.bind(u,X),t=0,n=K(R,w,function(n){let r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};if(n==D.FOCUS_EVENT){let n=Date.now();z().revalidateOnFocus&&n>t&&U()&&(t=n+z().focusThrottleInterval,e())}else if(n==D.RECONNECT_EVENT)z().revalidateOnReconnect&&U()&&e();else if(n==D.MUTATE_EVENT)return ed();else if(n==D.ERROR_REVALIDATE_EVENT)return ed(r)});return A.current=!1,N.current=R,j.current=!0,q({_k:O}),eu&&(s(er)||S?e():L(e)),()=>{A.current=!0,n()}},[R]),V(()=>{let e;function t(){let t=c(p)?p(W().data):p;t&&-1!==e&&(e=setTimeout(n,t))}function n(){!W().error&&(m||z().isVisible())&&(y||z().isOnline())?ed(X).then(t):t()}return t(),()=>{e&&(clearTimeout(e),e=-1)}},[p,m,y,R]),(0,i.useDebugValue)(ea),l&&s(er)&&R){if(!k&&S)throw Error("Fallback data is required when using suspense in SSR.");I.current=t,F.current=n,A.current=!1;let e=T[R];if(s(e)||Q(ef(e)),s(ei)){let e=ed(X);s(ea)||(e.status="fulfilled",e.value=!0),Q(e)}else throw ei}return{mutate:ef,get data(){return G.data=!0,ea},get error(){return G.error=!0,ei},get isValidating(){return G.isValidating=!0,es},get isLoading(){return G.isLoading=!0,ec}}},function(){for(var e=arguments.length,t=Array(e),n=0;n<e;n++)t[n]=arguments[n];let i=Z(),[o,a,u]=J(t),l=q(i,u),s=r,{use:c}=l,d=(c||[]).concat(H);for(let e=d.length;e--;)s=d[e](s);return s(o,a||l.fetcher||null,l)})}}]);
//# sourceMappingURL=796-db8375c24fc8638b.js.map