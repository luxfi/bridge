//const feedbackToken = "5366632516:AAHRlo58yEgoAj2-qe2poJOR19ybOuGMBpQ"
//const feedbackChat_id = "-1001625192521";
//const errorToken = '5438366819:AAHhbISk7q_Wx2CpKUVBCAfIsidhp_bmGKM'
//const errorChat_id = '-1001844311453'

export const SendFeedbackMessage = async (title: string, text: string) => {
    console.log('feedback', title, text)
    return {ok: true, description: 'done'}
    //return await (await fetch(`https://api.telegram.org/bot${feedbackToken}/sendMessage?chat_id=${feedbackChat_id}&text=${title} %0A ${text}`)).json()
}

export const SendErrorMessage = async (title: string, text: string) => {
    console.log('error', title, text)
    return {ok: true, description: 'done'}
    //if (text.length > 2000) {
    //    text = text.slice(0, 2000);
    //}

    //return await (await fetch(`https://api.telegram.org/bot${errorToken}/sendMessage?chat_id=${errorChat_id}&text=${title} %0A ${text}`)).json()
}


export const SendTransactionData = async (swapId: string, txHash: string) => {
    console.log('swapId', swapId, 'txHash', txHash)
    return {ok: true, description: 'done'}
    //try {
    //    return await (await fetch(`https://api.telegram.org/bot${errorToken}/sendMessage?chat_id=${errorChat_id}&text=swapId:  ${swapId} %0A transaction hash: ${txHash}`)).json()
    //}
    //catch( e: any ) {
    //    //TODO log to logger
    //    console.log(e)
    //}
}
