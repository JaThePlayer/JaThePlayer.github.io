console.log("hi")

const queryStringParams = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
});

/*
Query params
- method=Celeste.Player.Render
- line=15f5 (IL Opcode offset to scroll to)
- v=1 (which file from the file list for the given method to use, uses most recent otherwise)
*/

// Get the value of "method" in eg "http://127.0.0.1:5500/celeste/ilhookview/index.html?method=Celeste.Player.Render&line=15f5"
// returns null if the param is missing
const targetMethodName = sanitizeMethodName(queryStringParams.method ?? "Celeste.Player.orig_Update");
console.log(targetMethodName)

const db = await fetch('db/info.json').then((r) => r.json());
db.methods = db.methods.sort((a, b) => a.name.localeCompare(b.name))

function updateUrl(data) {
    const url = new URL(location);

    for (const toUpdate of data) {
        if (toUpdate.value) {
            url.searchParams.set(toUpdate.name, toUpdate.value);
        } else {
            url.searchParams.delete(toUpdate.name ?? toUpdate)
        }
    }

    history.pushState({}, "", url);
}

// create the dropdown
const methodDropdown = document.getElementById('methodSelect')
for (var x of db.methods) {
    methodDropdown.options[methodDropdown.options.length] = new Option(x.name, x.directoryName);
}
methodDropdown.onchange = async function() {
    updateUrl([
        { name: "method", value: this.value },
        "line"
    ])

    await createILViewAsync(this.value)
}

function sanitizeMethodName(unsanitized) {
    return unsanitized
}

function getMethodInfo(name) {
    return db.methods.find(m => m.name === name || m.directoryName === name)
}

function methodExists(name) {
    return getMethodInfo(name) != undefined
}

async function getFileListAsync(func) {
    const response = await fetch(`db/${func}/files.json`);
    const files = await response.json()
    files.sort((a, b) => b - a)
    return files;
}

const ilRegex = /(.) IL_([\da-f]+): ([^ \n]+)(?: ([^@\n]+))? ?(?:@(.*))?/
// /(.) IL_([\da-f]+): ([^ \n]+)(?: ([^@\n]+))?(?:@(.*))?/
function parseILInstructionString(instr) {
    const ilMatches = instr.match(ilRegex)
    //console.log(ilMatches)

    if (ilMatches === null) {
        return {
            fullText: instr,
            firstChar: instr[0]
        }
    }

    return {
        firstChar: ilMatches[1],
        offset: ilMatches[2],
        opcode: ilMatches[3],
        operand: ilMatches[4],
        sourceMod: ilMatches[5]?.trim(),
        fullText: instr
    }
}

async function fetchMethodAsync(func) {
    const methodInfo = getMethodInfo(func)
    const files = await getFileListAsync(methodInfo.directoryName)

    const filename = queryStringParams.v ??= files[0]
    if (!files.includes(filename)) {
        return [{
            fullText: "Couldn't find the file! Is the 'v' query string correct?",
            firstChar: "!"
        }]
    }

    const rawPath = `db/${methodInfo.directoryName}/${filename}`
    const response = await fetch(rawPath);
    return {
        data: (await response.text()).split('\n').map((v) => parseILInstructionString(v.trimEnd())),
        rawAdress: rawPath
    };
}

function appendSpanElement(toElement, text) {
    const el = document.createElement("span")
    el.innerText = text
    toElement.appendChild(el)

    return el
}

let func = targetMethodName
console.log(func, methodExists(func));

const codeElements = []

function scrollToOpcodeAtOffset(offset) {
    const target = codeElements.find(e => e.instr.offset == offset)
    target.div.scrollIntoView()
}

async function createILViewAsync(func) {
    const methodInfo = getMethodInfo(func)
    if (methodInfo) {
        const funcData = await fetchMethodAsync(func);
        const funcIL = funcData.data;

        document.querySelector('.method-name').textContent = methodInfo.name;
        document.getElementById('raw-link').href = funcData.rawAdress;
    
        const ilDiffViewElement = document.querySelector('.il-diff-view')
        while (ilDiffViewElement.lastChild) {
            ilDiffViewElement.removeChild(ilDiffViewElement.lastChild)
        }
    
        for (const instr of funcIL) {
            if (instr.fullText.startsWith("IL Diff:")) {
                continue
            }
    
            const d = document.createElement("pre")
            ilDiffViewElement.appendChild(d)
            //d.innerText = instr.fullText
            
            if (instr.firstChar == '+') {
                d.className = "addedIL"
            } else if (instr.firstChar == '-') {
                d.className = "removedIL"
            } else if (instr.fullText.startsWith('  |->')) {
                d.className = "additionalInfo"
                d.innerText = instr.fullText
                continue
            }
    
            if (!instr.opcode) {
                d.innerText = instr.fullText
                continue;
            }
    
            appendSpanElement(d, instr.firstChar + " ")
            appendSpanElement(d, `IL_${instr.offset}: `)
            appendSpanElement(d, `${instr.opcode} `)
            if (instr.operand) {
                if (instr.operand.startsWith("IL_")) {
                    const targetLabel = instr.operand.trim().substring("IL_".length)
                    let target = null
        
                    const jumpToLabelButton = document.createElement("a")
                    jumpToLabelButton.textContent = instr.operand.trim()
                    jumpToLabelButton.onclick = function() {
                        target ??= codeElements.find(e => e.instr.offset == targetLabel)
                        target.div.scrollIntoView()

                        updateUrl([
                            { name: "line", value: targetLabel },
                        ])
                    }
                    jumpToLabelButton.onmouseover = function() {
                        target ??= codeElements.find(e => e.instr.offset == targetLabel)
                        target.div.classList.add("highlighted")
                    }
                    jumpToLabelButton.onmouseleave = function() {
                        target ??= codeElements.find(e => e.instr.offset == targetLabel)
                        target.div.classList.remove("highlighted")
                    }
        
                    d.appendChild(jumpToLabelButton)
                    appendSpanElement(d, ` `)
                } else {
                    appendSpanElement(d, `${instr.operand}`)
                }
            }
            if (instr.sourceMod) {
                const modEl = appendSpanElement(d, `@ ${instr.sourceMod}`)
                modEl.classList.add('sourceMod')
            }
    
    
    
            codeElements.push({
                instr: instr,
                div: d
            })
        }
    }
}

await createILViewAsync(func)

if (queryStringParams.line) {
    scrollToOpcodeAtOffset(queryStringParams.line.padStart(4, '0'))
}