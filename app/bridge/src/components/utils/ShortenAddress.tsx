function shortenAddress(address: string, length: number = 6) {
    if (address?.startsWith('ronin:')) {
        var stringAddress = address.replace('ronin:', '')
        return `ronin:${InnerShortenAddress(stringAddress)}`
    } else if (address?.startsWith('zksync:')) {
        var stringAddress = address.replace('zksync:', '')
        return `zksync:${InnerShortenAddress(stringAddress)}`
    } else {
        return InnerShortenAddress(address)
    }

    function InnerShortenAddress(address: string) {
        if (address?.length < 13)
            return address;
        return `${address?.substring(0, length)}...${address?.substr(address?.length - length, address?.length)}`
    }
}

const shortenEmail = (email: string = '', maxNameLenght:number = 14) => {
    const [name, domain] = email.split('@');
    const { length: len } = name;
    let shortName = name;
    if (len > maxNameLenght) {
        shortName = name?.substring(0, maxNameLenght / 3 * 2) + '...' + name?.substring(len - maxNameLenght / 3, len);
    }
    const maskedEmail = shortName + '@' + domain;
    return maskedEmail;
}

const capitalizeFirstCharacter = (text: string) => {
    if (text.length === 0) {
        return ''
    } else {
        return text.substring(0, 1).toUpperCase() + text.substring(1, text.length).toLowerCase()
    }
}

export {
  shortenAddress as default,
  shortenEmail,
  capitalizeFirstCharacter 
}

