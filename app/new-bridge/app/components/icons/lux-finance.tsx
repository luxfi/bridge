import React from 'react'
import { type LucideProps } from 'lucide-react'

const LuxFinance: React.FC<LucideProps> = (props: LucideProps) => (
<svg
  width={24}
  height={24}
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  {...props}
>
  <path
    fillRule="evenodd"
    clipRule="evenodd"
    d="M16.4293 5.48461L15.839 6.52972C15.7655 6.65871 15.6026 6.70391 15.4737 6.63047C15.4256 6.60316 15.3899 6.56362 15.3673 6.51842L15.2552 6.32447L6.71533 11.2552C6.58728 11.3296 6.42346 11.2854 6.34908 11.1573C6.2747 11.0293 6.31801 10.8655 6.447 10.7911L14.9869 5.86109L14.7637 5.47506C14.6903 5.34701 14.7346 5.18318 14.8626 5.10973C14.9059 5.08525 14.9521 5.07395 14.9982 5.07395L16.1987 5.08525C16.3465 5.08619 16.4651 5.20765 16.4642 5.35547C16.4632 5.40161 16.451 5.44586 16.4293 5.48446L16.4293 5.48461ZM5.48955 13.3757H8.39683C8.5456 13.3757 8.66517 13.4962 8.66517 13.644V17.2284C8.66517 17.3772 8.54465 17.4968 8.39683 17.4968H5.48955C5.34078 17.4968 5.22121 17.3763 5.22121 17.2284V13.644C5.22027 13.4953 5.34079 13.3757 5.48955 13.3757ZM8.12868 13.9124H5.7579V16.9593H8.12868V13.9124ZM20.7642 20.1841V22.8968H23.2856V17.3944H20.7642V20.1841ZM20.2265 22.8968V20.4535H17.7051V22.8968H20.2265ZM20.4958 16.8566H23.2856V14.7241H21.9891L19.2172 14.725H17.7051V16.8576L20.4958 16.8566ZM18.3247 21.9825C18.1759 21.9825 18.0563 21.8619 18.0563 21.7141C18.0563 21.5654 18.1769 21.4449 18.3247 21.4449H19.608C19.7568 21.4449 19.8763 21.5654 19.8763 21.7141C19.8763 21.8629 19.7558 21.9825 19.608 21.9825H18.3247ZM21.3836 19.8376C21.2349 19.8376 21.1153 19.7171 21.1153 19.5693C21.1153 19.4206 21.2358 19.3 21.3836 19.3H22.667C22.8157 19.3 22.9362 19.4206 22.9362 19.5693C22.9362 19.7181 22.8157 19.8376 22.667 19.8376H21.3836ZM21.3836 21.0692C21.2349 21.0692 21.1153 20.9487 21.1153 20.8008C21.1153 20.6521 21.2358 20.5325 21.3836 20.5325H22.667C22.8157 20.5325 22.9362 20.653 22.9362 20.8008C22.9362 20.9496 22.8157 21.0692 22.667 21.0692H21.3836ZM5.50441 7.82448C5.50441 8.07775 5.61834 8.30467 5.80287 8.46849C5.91586 8.56923 6.05614 8.64456 6.21151 8.68598V8.77449C6.21151 8.92325 6.33203 9.04282 6.47984 9.04282C6.6286 9.04282 6.74817 8.9223 6.74817 8.77449V8.68598C6.90353 8.64456 7.04382 8.56923 7.15681 8.46849C7.34135 8.30466 7.45527 8.07775 7.45527 7.82448C7.45527 7.57122 7.34134 7.3443 7.15681 7.18048C6.98168 7.02512 6.74159 6.92815 6.4789 6.92815C6.35085 6.92815 6.23692 6.8839 6.15595 6.81234C6.08439 6.74926 6.04014 6.66264 6.04014 6.56942C6.04014 6.4762 6.08439 6.38959 6.15595 6.3265C6.23692 6.25494 6.34991 6.21069 6.4789 6.21069C6.60695 6.21069 6.72088 6.25494 6.80184 6.3265C6.8734 6.38958 6.91765 6.4762 6.91765 6.56942C6.91765 6.71818 7.03817 6.83775 7.18599 6.83775C7.33475 6.83775 7.45432 6.71723 7.45432 6.56942C7.45432 6.31615 7.34039 6.08924 7.15586 5.92541C7.04287 5.82467 6.90259 5.74934 6.74722 5.70792V5.61941C6.74722 5.47065 6.6267 5.35108 6.47889 5.35108C6.33013 5.35108 6.21056 5.4716 6.21056 5.61941V5.70792C6.0552 5.74935 5.91491 5.82467 5.80192 5.92541C5.61738 6.08924 5.50346 6.31615 5.50346 6.56942C5.50346 6.82269 5.61739 7.0496 5.80192 7.21343C5.97799 7.36878 6.21714 7.46575 6.47983 7.46575C6.60788 7.46575 6.72181 7.51 6.80278 7.58156C6.87434 7.64464 6.91859 7.73126 6.91859 7.82448C6.91859 7.9177 6.87434 8.00432 6.80278 8.06741C6.72181 8.13896 6.60882 8.18322 6.47983 8.18322C6.35178 8.18322 6.23785 8.13896 6.15689 8.06741C6.08533 8.00432 6.04108 7.9177 6.04108 7.82448C6.04108 7.67572 5.92056 7.55615 5.77274 7.55615C5.62492 7.55521 5.50441 7.67573 5.50441 7.82448ZM12.6214 19.204H17.1671V23.1652C17.1671 23.3139 17.2876 23.4335 17.4354 23.4335H23.5537C23.7025 23.4335 23.8221 23.313 23.8221 23.1652L23.823 17.126V14.4558C23.823 14.307 23.7025 14.1874 23.5547 14.1874H22.2582L22.2572 4.13747C22.6564 4.08097 23.0151 3.8936 23.2882 3.62056C23.6177 3.29103 23.823 2.83626 23.823 2.33536C23.823 1.83447 23.6187 1.3797 23.2882 1.05016C22.9587 0.720627 22.5039 0.515366 22.003 0.515366H2.7033C2.20239 0.515366 1.74763 0.719683 1.4181 1.05016C1.08856 1.3797 0.883301 1.83447 0.883301 2.33536C0.883301 2.83626 1.08762 3.29103 1.4181 3.62056C1.69115 3.89362 2.04987 4.08098 2.44909 4.13747V18.9358C2.44909 19.0846 2.5696 19.2042 2.71742 19.2042H12.0839V20.1127C12.0839 20.1231 12.0848 20.1335 12.0857 20.1429C11.9445 20.1871 11.8183 20.2643 11.7157 20.366C11.5528 20.5289 11.4521 20.7539 11.4521 21.0025C11.4521 21.2511 11.5528 21.4761 11.7157 21.639C11.8786 21.8019 12.1036 21.9026 12.3522 21.9026C12.6008 21.9026 12.8258 21.8019 12.9887 21.639C13.1516 21.4761 13.2523 21.2511 13.2523 21.0025C13.2523 20.7539 13.1516 20.5289 12.9887 20.366C12.887 20.2643 12.7599 20.1862 12.6187 20.1429C12.6196 20.1335 12.6205 20.1231 12.6205 20.1127L12.6214 19.204ZM12.6101 20.7462C12.676 20.8121 12.7165 20.9025 12.7165 21.0033C12.7165 21.1031 12.676 21.1944 12.6101 21.2603C12.5442 21.3262 12.4538 21.3667 12.353 21.3667C12.2532 21.3667 12.1619 21.3262 12.096 21.2603C12.0301 21.1944 11.9896 21.104 11.9896 21.0033C11.9896 20.9035 12.0301 20.8121 12.096 20.7462C12.1619 20.6803 12.2523 20.6398 12.353 20.6398C12.4528 20.6398 12.5442 20.6803 12.6101 20.7462ZM19.2347 19.2972C19.2347 19.4459 19.1142 19.5655 18.9664 19.5655C18.8176 19.5655 18.6981 19.445 18.6981 19.2972L18.6971 18.9234H18.3243C18.1755 18.9234 18.056 18.8029 18.056 18.655C18.056 18.5063 18.1765 18.3867 18.3243 18.3867H18.6971V18.0139C18.6971 17.8651 18.8176 17.7455 18.9655 17.7455C19.1142 17.7455 19.2338 17.8661 19.2338 18.0139L19.2347 18.3867H19.6076C19.7563 18.3867 19.8759 18.5072 19.8759 18.655C19.8759 18.8038 19.7554 18.9234 19.6076 18.9234H19.2347V19.2972ZM17.7047 19.9158V17.3953H20.2262V19.9168L17.7047 19.9158ZM21.7194 4.15526H2.9863V18.6664H17.1668V17.497H16.3081C16.1594 17.497 16.0398 17.3765 16.0398 17.2287V7.28796C16.0398 7.1392 16.1603 7.01963 16.3081 7.01963H19.2154C19.3642 7.01963 19.4837 7.14014 19.4837 7.28796V14.1876H21.7179L21.7194 4.15526ZM22.0028 1.05293C22.3549 1.05293 22.675 1.19699 22.9085 1.42955C23.1411 1.66211 23.2852 1.98225 23.2852 2.33532C23.2852 2.68746 23.1411 3.00759 22.9085 3.24109C22.676 3.47365 22.3558 3.61771 22.0028 3.61771H2.71713L2.703 3.61677C2.35087 3.61677 2.03074 3.47271 1.79723 3.24015C1.56468 3.00759 1.42062 2.68746 1.42062 2.33438C1.42062 1.98225 1.56467 1.66211 1.79723 1.42861C2.02979 1.19605 2.34993 1.05199 2.703 1.05199L22.0028 1.05293ZM10.8993 9.96C10.7505 9.96 10.6309 10.0805 10.6309 10.2293V17.2287C10.6309 17.3775 10.7515 17.4971 10.8993 17.4971H13.8066C13.9553 17.4971 14.0749 17.3766 14.0749 17.2287L14.0758 10.2293C14.0758 10.0805 13.9553 9.96 13.8075 9.96H10.8993ZM13.5384 10.4976H11.1676V16.9596H13.5384V10.4976ZM18.2253 14.9134H22.7636C22.9124 14.9134 23.032 15.0339 23.032 15.1817V16.4726C23.032 16.6214 22.9115 16.7409 22.7636 16.7409H18.2253C18.0766 16.7409 17.957 16.6204 17.957 16.4726V15.1817C17.957 15.0339 18.0766 14.9134 18.2253 14.9134ZM22.4953 15.451V16.2052H18.4937V15.451H22.4953ZM17.4364 14.1875C17.2876 14.1875 17.168 14.308 17.168 14.4558V16.9594H16.5786L16.5777 7.55617H18.9474V14.1875L17.4364 14.1875Z"
    fill="#949494"
  />
</svg>

)

export default LuxFinance
