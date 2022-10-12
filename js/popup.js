const USAGE_STORAGE_KEY = 'usage'
const RATING_STORAGE_KEY = 'rating'


const formatBytes = (bytes, size, decimals = 2) => {
    if (!bytes || bytes === '0') return '0';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = sizes.indexOf(size) > -1 ? sizes.indexOf(size) : Math.floor(Math.log(bytes) / Math.log(k));

    return (bytes / Math.pow(k, i)).toFixed(decimals) + ' ' + sizes[i];
}

function onRatingSourceClicked(){
    for (let i = 0; i < this.attributes.length; i++){
        const attr = this.attributes[i]

        if (attr.name === 'href'){
            chrome.tabs.create({ url: attr.value });
            break
        }
    }
    return false;
}

const loadUsage = ()=>chrome.storage.local.get([USAGE_STORAGE_KEY], ({ usage }) => {
    console.log(usage)

    const data = usage ? Object.entries(usage).flatMap(([site, hosts])=>
        Object.entries(hosts).map(([host, {requests, usage}])=>
            ({site, host, requests, usage }))) : []

    $('#table').dataTable({
        scrollX: true,
        data,
        columns : [
            { title: "Site", data : "site" },
            { title: "Host", data : "host" },
            { title: "Requests", data : "requests" },
            { title: "Usage", data : "usage", render: formatBytes }
        ]
    })
})

const loadRating = () => chrome.storage.local.get([RATING_STORAGE_KEY], ({ rating }) => {
    const isEmpty = !rating || !rating.length
    const text = isEmpty ? 'No rating available!' : 'Sites rating data'
    $('#no-rating-data').html(text)

    if(isEmpty) return

    console.log(rating)

    $('#rating-table').dataTable({
        data: rating,
        scrollX: true,
        columns : [
            { title: "Host", data : "host" },
            { title: "Rating", data : "rating" },
            { title: "Source", data : "url", render: href => `<a href="${href}" class="a-rating-source" target="_blank">Read more</a>`
            }
        ]
    })

    const links = document.getElementsByClassName('a-rating-source')
    for (let i = 0; i < links.length; i++){
        links[i].removeEventListener("click", onRatingSourceClicked)
        links[i].addEventListener("click", onRatingSourceClicked)
    }
})


$(async ()=> {
    loadUsage()
    loadRating()
})

window.onresize = ()=>$('table, .dataTables_scrollHeadInner').width('100%')

