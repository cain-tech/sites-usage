const RATING_STORAGE_KEY = 'rating'

const updateRating = () => {
    if(!chrome.runtime.id) return
    chrome.runtime.sendMessage({action: "update-rating"})
    updateUI()
}


const updateUI = () => chrome.storage.local.get([RATING_STORAGE_KEY], ({ rating }) => {
    let currentRating
    if(rating && rating.length) currentRating = rating.find(({ host })=> location.host === host)

    const floatingRate = document.getElementById('site-usage-rating')

    if (floatingRate) floatingRate.remove()

    document.body.innerHTML += `<div id="site-usage-rating" style="
        position:fixed;
        width:80px;
        height:80px;
        bottom:40px;
        right:40px;
        background-color: ${currentRating ? `rgba(255, 0, 0, ${currentRating.rating / 10})` : 'green'};
        color:black;
        border-radius:50px;
        text-align:center;
        z-index: 9999;
        font-size: 13px;
        padding: 6px;
        font-family: monospace;
        line-height: 15px;
        word-wrap: normal;
    ">
        Site Malicious Rate<br><b>${currentRating ? currentRating.rating : '0.0'}</b>    
    </div>`
})

updateRating()
setInterval(updateRating, 20000)
