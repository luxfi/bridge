import { type AuthData } from "../context/authContext";
import { checkStorageIsAvailable } from "../util/storageAvailable";

class TokenService {
    getAuthData(): (AuthData | undefined | null) {
        return checkStorageIsAvailable('localStorage') ? (JSON.parse((window?.localStorage?.getItem("authData") || "null"))) : undefined;
    }
    setAuthData(data: any) {
        checkStorageIsAvailable('localStorage') && localStorage.setItem("authData", JSON.stringify(data));
    }
    getCodeNextTime(): Date | undefined {
        return checkStorageIsAvailable('localStorage') ? JSON.parse((window?.localStorage?.getItem("codeNextTime") || "null")) : undefined;
    }
    setCodeNextTime(time: Date) {
        checkStorageIsAvailable('localStorage') && localStorage.setItem("codeNextTime", JSON.stringify(time));
    }
    removeAuthData() {
        checkStorageIsAvailable('localStorage') && localStorage.removeItem("authData");
    }
}

let tokenService = new TokenService();
export default tokenService;