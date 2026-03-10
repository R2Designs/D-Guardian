type IssueCategory = "Typography" | "Spacing" | "Colors"

type AuditIssue = {
  id: string
  category: IssueCategory
  kind: string
  nodeId: string
  nodeName: string
  nodeType: string
  description: string
}

type ScanResult = {
  frameId: string
  frameName: string
  totalIssues: number
  issues: Record<IssueCategory, AuditIssue[]>
}

type PluginMessage =
  | {
      type: "scan-results"
      result: ScanResult
    }
  | {
      type: "plugin-error"
      message: string
    }
  | {
      type: "plugin-status"
      message: string
    }

const categoryMap = {
  Typography: {
    list: document.getElementById("typography-list") as HTMLDivElement,
    count: document.getElementById("count-typography") as HTMLSpanElement
  },
  Spacing: {
    list: document.getElementById("spacing-list") as HTMLDivElement,
    count: document.getElementById("count-spacing") as HTMLSpanElement
  },
  Colors: {
    list: document.getElementById("colors-list") as HTMLDivElement,
    count: document.getElementById("count-colors") as HTMLSpanElement
  }
}

function post(type: string, payload: Record<string, unknown> = {}) {
  parent.postMessage({ pluginMessage: { type, ...payload } }, "*")
}

function setMessage(id: string, message: string, isVisible: boolean) {
  const element = document.getElementById(id) as HTMLDivElement
  element.textContent = message
  element.classList.toggle("visible", isVisible)
}

function clearAlerts() {
  setMessage("error-box", "", false)
  setMessage("status-box", "", false)
}

function setResolving(isResolving: boolean) {
  const resolveButton = document.getElementById("resolve") as HTMLButtonElement
  const resolveLabel = document.getElementById("resolve-label") as HTMLSpanElement
  const resolveSpinner = document.getElementById("resolve-spinner") as HTMLSpanElement

  resolveButton.disabled = isResolving
  resolveButton.setAttribute("aria-busy", String(isResolving))
  resolveSpinner.classList.toggle("visible", isResolving)
  resolveLabel.textContent = isResolving ? "Resolving..." : "Resolve All Issues"
}

function setError(message: string) {
  setResolving(false)
  setMessage("status-box", "", false)
  setMessage("error-box", message, Boolean(message))
}

function setStatus(message: string) {
  setResolving(false)
  setMessage("error-box", "", false)
  setMessage("status-box", message, Boolean(message))
}

function createIssueButton(issue: AuditIssue): HTMLButtonElement {
  const button = document.createElement("button")
  button.className = "issue"
  button.type = "button"
  button.addEventListener("click", () => {
    post("select-node", { nodeId: issue.nodeId })
  })

  const title = document.createElement("p")
  title.className = "issue-title"
  title.textContent = issue.nodeName

  const meta = document.createElement("p")
  meta.className = "issue-meta"
  meta.textContent = issue.nodeType

  const detail = document.createElement("p")
  detail.className = "issue-detail"
  detail.textContent = issue.description

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
    target.list.appendChild(createIssueButton(issue))
  })
}

function renderResults(result: ScanResult) {
  clearAlerts()
  ;(document.getElementById("frame-name") as HTMLParagraphElement).textContent = result.frameName
  ;(document.getElementById("issue-count") as HTMLSpanElement).textContent = String(result.totalIssues)
  ;(document.getElementById("summary-pill") as HTMLDivElement).textContent =
    result.totalIssues === 0 ? "Healthy" : `${result.totalIssues} issues`
  ;(document.getElementById("summary-meta") as HTMLParagraphElement).textContent =
    "Resolve duplicates the frame and applies Guardian cleanup to the copy only."

  renderCategory("Typography", result.issues.Typography)
  renderCategory("Spacing", result.issues.Spacing)
  renderCategory("Colors", result.issues.Colors)
}

;(document.getElementById("scan") as HTMLButtonElement).addEventListener("click", () => {
  post("scan-frame")
})

;(document.getElementById("resolve") as HTMLButtonElement).addEventListener("click", () => {
  const useDesignSystem = (document.getElementById("design-system") as HTMLInputElement).checked
  setResolving(true)
  post("resolve-issues", { useDesignSystem })
})

;(document.getElementById("close") as HTMLButtonElement).addEventListener("click", () => {
  post("close")
})

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
  const message = event.data.pluginMessage
  if (!message) {
    return
  }

  if (message.type === "scan-results") {
    renderResults(message.result)
    return
  }

  if (message.type === "plugin-error") {
    setError(message.message)
    return
  }

  if (message.type === "plugin-status") {
    setStatus(message.message)
  }
}
