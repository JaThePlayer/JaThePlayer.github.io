const db = await fetch('db/info.json').then((r) => r.json());

// stats
function setStat(name, val) {
    const el = document.getElementById(name)
    el.innerText = val
}

setStat('last-update', new Date(Date.parse(db.time)).toLocaleString())
setStat('everest-ver', db.everestVersion)

const modListEl = document.getElementById('mod-list')
for (const mod of db.mods.sort((a, b) => a.name.localeCompare(b.name))) {
    const el = document.createElement("li")

    el.innerText = `${mod.name} [${mod.version}]`

    modListEl.appendChild(el)
}