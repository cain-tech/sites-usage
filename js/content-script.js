const RATING_STORAGE_KEY = 'rating'
const BTN_ID = 'site-usage-rating'


let lastRating

const updateRating = () => {
    if(!chrome.runtime.id) return
    chrome.runtime.sendMessage({action: "update-rating"})
    updateUI()
}

const createRatingBtn = () => {
    const btn = document.createElement(`div`)
    btn.setAttribute('id', BTN_ID);

    btn.style.cssText = `
        position:fixed;
        width:80px;
        height:80px;
        bottom:40px;
        right:40px;
        color:black;
        border-radius:50px;
        text-align:center;
        z-index: 9999;
        font-size: 13px;
        padding: 6px;
        font-family: monospace;
        line-height: 15px;
        word-wrap: normal;
    `

    return btn
}

const updateUI = () => chrome.storage.local.get(RATING_STORAGE_KEY, ({ rating }) => {
    let newRating

    if(rating && rating.length) newRating = rating.find(({ host })=> location.host === host)

    if (lastRating && (!newRating || newRating.rating === lastRating)) return

    lastRating = newRating ? newRating.rating : 0.0

    let btn = document.getElementById(BTN_ID)
    if (!btn) btn = createRatingBtn()

    btn.style.backgroundColor = lastRating ? `rgba(255, 0, 0, ${lastRating / 10})` : 'green'
    btn.innerHTML = `Site Malicious Rate<br><b>${lastRating.toFixed(1)}</b>`

    document.body.appendChild(btn);
    setTimeout(()=>fadeOut(btn), 3000)
})

const fadeOut = element => {
    const interval = setInterval(function () {
        if (!element.style.opacity) element.style.opacity = 1;

        if (element.style.opacity > 0) element.style.opacity -= 0.1;
        else clearInterval(interval);

    }, 200);
}

updateRating()
setInterval(updateRating, 20000)
