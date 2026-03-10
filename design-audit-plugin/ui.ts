type IssueCategory = "Typography" | "Layout" | "Colors"

type AuditIssue = {
  id: string
  category: IssueCategory
  title: string
  detail: string
  nodeId: string
  nodeName: string
  nodeType: string
}

type AuditResult = {
  healthScore: number
  totalIssues: number
  issues: Record<IssueCategory, AuditIssue[]>
}

type AuditMessage = {
  type: "audit-results"
  result: AuditResult
  pageName: string
}

type AuditErrorMessage = {
  type: "audit-error"
  message: string
}

const categoryMap = {
  Typography: {
    list: document.getElementById("typography-list") as HTMLDivElement,
    count: document.getElementById("count-typography") as HTMLSpanElement
  },
  Layout: {
    list: document.getElementById("layout-list") as HTMLDivElement,
    count: document.getElementById("count-layout") as HTMLSpanElement
  },
  Colors: {
    list: document.getElementById("colors-list") as HTMLDivElement,
    count: document.getElementById("count-colors") as HTMLSpanElement
  }
}

function post(type: string, payload: Record<string, unknown> = {}) {
  parent.postMessage({ pluginMessage: { type, ...payload } }, "*")
}

function formatIssue(issue: AuditIssue): HTMLButtonElement {
  const button = document.createElement("button")
  button.className = "issue"
  button.type = "button"
  button.addEventListener("click", () => post("select-node", { nodeId: issue.nodeId }))

  const title = document.createElement("p")
  title.className = "issue-title"
  title.textContent = issue.title

  const meta = document.createElement("p")
  meta.className = "issue-meta"
  meta.textContent = `${issue.nodeName} · ${issue.nodeType}`

  const detail = document.createElement("p")
  detail.className = "issue-detail"
  detail.textContent = issue.detail

  button.append(title, meta, detail)
  return button
}

function renderCategory(name: IssueCategory, issues: AuditIssue[]) {
  const target = categoryMap[name]
  target.count.textContent = String(issues.length)
  target.list.innerHTML = ""

  if (!issues.length) {
    const empty = document.createElement("p")
    empty.className = "empty"
    empty.textContent = "No issues found."
    target.list.appendChild(empty)
    return
  }

  issues.forEach((issue) => {
    target.list.appendChild(formatIssue(issue))
  })
}

function renderResults(result: AuditResult, pageName: string) {
  const errorBox = document.getElementById("error-box") as HTMLDivElement
  errorBox.classList.remove("visible")
  errorBox.textContent = ""
  ;(document.getElementById("page-name") as HTMLParagraphElement).textContent = pageName
  ;(document.getElementById("score") as HTMLSpanElement).textContent = String(result.healthScore)
  ;(document.getElementById("summary-pill") as HTMLDivElement).textContent =
    `${result.totalIssues} ${result.totalIssues === 1 ? "issue" : "issues"}`

  renderCategory("Typography", result.issues.Typography)
  renderCategory("Layout", result.issues.Layout)
  renderCategory("Colors", result.issues.Colors)
}

;(document.getElementById("refresh") as HTMLButtonElement).addEventListener("click", () => {
  post("run-audit")
})

;(document.getElementById("close") as HTMLButtonElement).addEventListener("click", () => {
  post("close")
})

window.onmessage = (event: MessageEvent<{ pluginMessage?: AuditMessage | AuditErrorMessage }>) => {
  const message = event.data.pluginMessage
  if (!message || message.type !== "audit-results") {
    if (message && message.type === "audit-error") {
      const errorBox = document.getElementById("error-box") as HTMLDivElement
      errorBox.textContent = message.message
      errorBox.classList.add("visible")
    }
    return
  }

  renderResults(message.result, message.pageName)
}
