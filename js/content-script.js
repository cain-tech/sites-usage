const RATING_STORAGE_KEY = 'rating'
const BTN_ID = 'site-usage-rating'


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
        background-color: 
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

const updateUI = () => chrome.storage.local.get([RATING_STORAGE_KEY], ({ rating }) => {
    let currentRating
    if(rating && rating.length) currentRating = rating.find(({ host })=> location.host === host)

    let btn = document.getElementById(BTN_ID)
    if (!btn) btn = createRatingBtn()

    btn.style.backgroundColor = currentRating ? `rgba(255, 0, 0, ${currentRating.rating / 10})` : 'green'
    btn.innerHTML = `Site Malicious Rate<br><b>${currentRating ? currentRating.rating : '0.0'}</b>`

    document.body.appendChild(btn);
})

updateRating()
setInterval(updateRating, 20000)
