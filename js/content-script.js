const RATING_STORAGE_KEY = 'rating'

const updateRating = () => {
    if(!chrome.runtime.id) return
    chrome.runtime.sendMessage({action: "update-rating"})
    updateUI()
}


const updateUI = () => chrome.storage.local.get([RATING_STORAGE_KEY], ({ rating }) => {
    if(!rating || !rating.length) return

    const currentRating = rating.find(({ host })=> location.host === host)

    if (!currentRating) return;

    const floatingRate = document.getElementById('site-usage-rating')

    if (floatingRate) floatingRate.remove()

    document.body.innerHTML += `<div id="site-usage-rating" style="
        position:fixed;
        width:80px;
        height:80px;
        bottom:40px;
        right:40px;
        background-color: rgba(255, 0, 0, ${currentRating.rating / 10});
        color:black;
        border-radius:50px;
        text-align:center;
        z-index: 9999;
        font-size: 13px;
        padding: 5px;
    ">Site Malicious Rate<br><b>${currentRating.rating}</b></div>`
})

updateRating()
setInterval(updateRating, 20000)
