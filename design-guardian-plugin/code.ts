type IssueCategory = "Typography" | "Spacing" | "Colors"
type IssueKind = "font-scale" | "line-height" | "spacing" | "color-style"

type AuditIssue = {
  id: string
  category: IssueCategory
  kind: IssueKind
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

type SpacingConfig = {
  tokens: number[]
}

figma.showUI(__html__, { width: 460, height: 740, themeColors: true })

const ALLOWED_FONT_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 40, 48]
const GRID_SIZE = 8
const FRAME_GAP = 120
const LINE_HEIGHT_RATIO = 1.4
const FLOAT_TOLERANCE = 0.01
const SPACING_CONFIG: SpacingConfig = {
  tokens: []
}

function createIssue(
  category: IssueCategory,
  kind: IssueKind,
  node: SceneNode,
  description: string
): AuditIssue {
  return {
    id: `${kind}-${node.id}-${description}`,
    category,
    kind,
    nodeId: node.id,
    nodeName: node.name || node.type,
    nodeType: node.type,
    description
  }
}

function isFrameNode(node: SceneNode | BaseNode): node is FrameNode {
  return "type" in node && node.type === "FRAME"
}

function getSelectedFrame(): FrameNode | null {
  if (figma.currentPage.selection.length !== 1) {
    return null
  }

  const selected = figma.currentPage.selection[0]
  return isFrameNode(selected) ? selected : null
}

function collectNodes(root: SceneNode): SceneNode[] {
  const nodes: SceneNode[] = [root]
  if ("children" in root) {
    for (const child of root.children) {
      nodes.push(...collectNodes(child))
    }
  }
  return nodes
}

function normalizeNumber(value: number): number {
  return Number(value.toFixed(2))
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function snapToToken(value: number, tokens: number[]): number {
  return tokens.reduce((closest, token) => {
    return Math.abs(token - value) < Math.abs(closest - value) ? token : closest
  }, tokens[0])
}

function closestFontSize(value: number): number {
  return ALLOWED_FONT_SIZES.reduce((closest, current) => {
    return Math.abs(current - value) < Math.abs(closest - value) ? current : closest
  }, ALLOWED_FONT_SIZES[0])
}

function isAllowedFontSize(value: number): boolean {
  return ALLOWED_FONT_SIZES.some((allowed) => Math.abs(allowed - value) < FLOAT_TOLERANCE)
}

function getVisibleSolidPaint(node: SceneNode): SolidPaint | null {
  if (!("fills" in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) {
    return null
  }

  for (const paint of node.fills) {
    const opacity = typeof paint.opacity === "number" ? paint.opacity : 1
    if (paint.type === "SOLID" && paint.visible !== false && opacity > 0) {
      return paint
    }
  }

  return null
}

function hasFillStyle(node: SceneNode): boolean {
  return "fillStyleId" in node && typeof node.fillStyleId === "string" && node.fillStyleId.length > 0
}

function hasTextStyle(node: TextNode): boolean {
  return typeof node.textStyleId === "string" && node.textStyleId.length > 0
}

function isInsideInstance(node: BaseNode): boolean {
  let current: BaseNode | null = node
  while (current) {
    if ("type" in current && current.type === "INSTANCE") {
      return true
    }
    current = "parent" in current ? current.parent : null
  }
  return false
}

function shouldSkipNode(node: SceneNode, excludeDesignSystemComponents: boolean): boolean {
  if (!excludeDesignSystemComponents) {
    return false
  }

  if (isInsideInstance(node)) {
    return true
  }

  if (node.type === "TEXT" && hasTextStyle(node)) {
    return true
  }

  return hasFillStyle(node)
}

function getNodeCornerRadius(node: SceneNode): number | null {
  if (!("cornerRadius" in node) || typeof node.cornerRadius !== "number") {
    return null
  }

  return node.cornerRadius
}

function isLineHeightNormalized(node: TextNode, fontSize: number): boolean {
  if (node.lineHeight === figma.mixed) {
    return false
  }

  if (node.lineHeight.unit !== "PIXELS") {
    return false
  }

  const expected = fontSize * LINE_HEIGHT_RATIO
  return Math.abs(node.lineHeight.value - expected) < 0.1
}

function scanFrame(frame: FrameNode, excludeDesignSystemComponents: boolean): ScanResult {
  const issues: Record<IssueCategory, AuditIssue[]> = {
    Typography: [],
    Spacing: [],
    Colors: []
  }

  const nodes = collectNodes(frame)
  for (const node of nodes) {
    if (shouldSkipNode(node, excludeDesignSystemComponents)) {
      continue
    }

    if (node.type === "TEXT") {
      const fontSize = node.fontSize
      if (typeof fontSize === "number") {
        if (!isAllowedFontSize(fontSize)) {
          issues.Typography.push(
            createIssue(
              "Typography",
              "font-scale",
              node,
              `Font size ${normalizeNumber(fontSize)}px is outside the allowed scale.`
            )
          )
        }

        if (!isLineHeightNormalized(node, fontSize)) {
          issues.Typography.push(
            createIssue(
              "Typography",
              "line-height",
              node,
              `Line height should be ${normalizeNumber(fontSize * LINE_HEIGHT_RATIO)} px.`
            )
          )
        }
      }
    }

    if (node.type === "FRAME") {
      const spacingProblems: string[] = []
      const checks = [
        ["paddingTop", node.paddingTop],
        ["paddingBottom", node.paddingBottom],
        ["paddingLeft", node.paddingLeft],
        ["paddingRight", node.paddingRight]
      ] as const

      for (const [label, value] of checks) {
        if (value % GRID_SIZE !== 0) {
          spacingProblems.push(`${label}: ${normalizeNumber(value)}`)
        }
      }

      if (node.layoutMode !== "NONE" && node.itemSpacing % GRID_SIZE !== 0) {
        spacingProblems.push(`itemSpacing: ${normalizeNumber(node.itemSpacing)}`)
      }

      const cornerRadius = getNodeCornerRadius(node)
      if (typeof cornerRadius === "number" && cornerRadius % GRID_SIZE !== 0) {
        spacingProblems.push(`cornerRadius: ${normalizeNumber(cornerRadius)}`)
      }

      if (spacingProblems.length > 0) {
        issues.Spacing.push(
          createIssue(
            "Spacing",
            "spacing",
            node,
            `Values off grid: ${spacingProblems.join(", ")}.`
          )
        )
      }
    }

    const solidPaint = getVisibleSolidPaint(node)
    if (solidPaint && !hasFillStyle(node)) {
      issues.Colors.push(
        createIssue(
          "Colors",
          "color-style",
          node,
          "Visible solid fill is not using a local color style."
        )
      )
    }
  }

  return {
    frameId: frame.id,
    frameName: frame.name,
    totalIssues: issues.Typography.length + issues.Spacing.length + issues.Colors.length,
    issues
  }
}

function colorDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

function getClosestPaintStyle(paint: SolidPaint, styles: PaintStyle[]): PaintStyle | null {
  let closest: PaintStyle | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const style of styles) {
    if (!Array.isArray(style.paints)) {
      continue
    }

    const stylePaint = style.paints.find((entry) => entry.type === "SOLID")
    if (!stylePaint || stylePaint.type !== "SOLID") {
      continue
    }

    const distance = colorDistance(paint.color, stylePaint.color)
    if (distance < bestDistance) {
      bestDistance = distance
      closest = style
    }
  }

  return closest
}

function getTextStyleFontSize(style: TextStyle): number | null {
  if ("fontSize" in style && typeof style.fontSize === "number") {
    return style.fontSize
  }
  return null
}

function getClosestTextStyle(fontSize: number, styles: TextStyle[]): TextStyle | null {
  let closest: TextStyle | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const style of styles) {
    const styleFontSize = getTextStyleFontSize(style)
    if (typeof styleFontSize !== "number") {
      continue
    }

    const distance = Math.abs(styleFontSize - fontSize)
    if (distance < bestDistance) {
      bestDistance = distance
      closest = style
    }
  }

  return closest
}

async function loadFontsForTextNode(node: TextNode) {
  const fontKeys = new Set<string>()

  if (node.characters.length === 0) {
    if (node.fontName !== figma.mixed) {
      const font = node.fontName as FontName
      fontKeys.add(`${font.family}::${font.style}`)
    }
  } else {
    const fonts = node.getRangeAllFontNames(0, node.characters.length)
    for (const font of fonts) {
      fontKeys.add(`${font.family}::${font.style}`)
    }
  }

  for (const key of fontKeys) {
    const [family, style] = key.split("::")
    await figma.loadFontAsync({ family, style })
  }
}

function resolveSpacingValue(value: number, useDesignSystem: boolean): number {
  if (useDesignSystem && SPACING_CONFIG.tokens.length > 0) {
    return snapToToken(value, SPACING_CONFIG.tokens)
  }

  return snapToGrid(value)
}

async function applyTypographyFix(node: TextNode, useDesignSystem: boolean, textStyles: TextStyle[]) {
  const fontSize = node.fontSize
  if (typeof fontSize !== "number") {
    return
  }

  await loadFontsForTextNode(node)

  if (useDesignSystem) {
    const closestTextStyle = getClosestTextStyle(fontSize, textStyles)
    if (closestTextStyle) {
      await node.setTextStyleIdAsync(closestTextStyle.id)
    } else {
      node.fontSize = closestFontSize(fontSize)
    }
  } else {
    node.fontSize = closestFontSize(fontSize)
  }

  const resolvedFontSize = typeof node.fontSize === "number" ? node.fontSize : closestFontSize(fontSize)
  node.lineHeight = {
    unit: "PIXELS",
    value: normalizeNumber(resolvedFontSize * LINE_HEIGHT_RATIO)
  }
}

function applySpacingFix(node: FrameNode, useDesignSystem: boolean) {
  node.paddingTop = resolveSpacingValue(node.paddingTop, useDesignSystem)
  node.paddingBottom = resolveSpacingValue(node.paddingBottom, useDesignSystem)
  node.paddingLeft = resolveSpacingValue(node.paddingLeft, useDesignSystem)
  node.paddingRight = resolveSpacingValue(node.paddingRight, useDesignSystem)

  if (node.layoutMode !== "NONE") {
    node.itemSpacing = resolveSpacingValue(node.itemSpacing, useDesignSystem)
  }

  const cornerRadius = getNodeCornerRadius(node)
  if (typeof cornerRadius === "number") {
    node.cornerRadius = resolveSpacingValue(cornerRadius, useDesignSystem)
  }
}

async function applyColorFix(node: SceneNode, paintStyles: PaintStyle[]) {
  const solidPaint = getVisibleSolidPaint(node)
  if (!solidPaint || hasFillStyle(node)) {
    return
  }

  const closestStyle = getClosestPaintStyle(solidPaint, paintStyles)
  if (closestStyle && "setFillStyleIdAsync" in node) {
    await node.setFillStyleIdAsync(closestStyle.id)
  }
}

async function resolveFrame(frame: FrameNode, excludeDesignSystemComponents: boolean): Promise<FrameNode> {
  const duplicate = frame.clone()
  duplicate.name = `${frame.name} – Guardian Clean`
  duplicate.x = frame.x + frame.width + FRAME_GAP
  duplicate.y = frame.y

  const localPaintStyles = await figma.getLocalPaintStylesAsync()
  const localTextStyles = await figma.getLocalTextStylesAsync()
  const duplicateNodes = collectNodes(duplicate)

  for (const node of duplicateNodes) {
    if (shouldSkipNode(node, excludeDesignSystemComponents)) {
      continue
    }

    if (node.type === "TEXT") {
      await applyTypographyFix(node, false, localTextStyles)
    }

    if (node.type === "FRAME") {
      applySpacingFix(node, false)
    }

    await applyColorFix(node, localPaintStyles)
  }

  return duplicate
}

function postScan(result: ScanResult) {
  figma.ui.postMessage({
    type: "scan-results",
    result
  })
}

function postStatus(message: string) {
  figma.ui.postMessage({
    type: "plugin-status",
    message
  })
}

function postError(message: string) {
  figma.notify(message, { error: true })
  figma.ui.postMessage({
    type: "plugin-error",
    message
  })
}

async function selectIssueNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !("type" in node) || !("parent" in node) || ("removed" in node && node.removed)) {
    return
  }

  figma.currentPage.selection = [node as SceneNode]
  figma.viewport.scrollAndZoomIntoView([node as SceneNode])
}

async function handleScan(excludeDesignSystemComponents: boolean) {
  const frame = getSelectedFrame()
  if (!frame) {
    postError("Select a frame to scan")
    return
  }

  postStatus("")
  postScan(scanFrame(frame, excludeDesignSystemComponents))
}

async function handleResolve(excludeDesignSystemComponents: boolean) {
  const frame = getSelectedFrame()
  if (!frame) {
    postError("Select a frame to scan")
    return
  }

  const duplicate = await resolveFrame(frame, excludeDesignSystemComponents)
  figma.currentPage.selection = [duplicate]
  figma.viewport.scrollAndZoomIntoView([duplicate])
  figma.notify("Guardian Clean frame created")
  postStatus("Guardian Clean frame created")
  postScan(scanFrame(duplicate, excludeDesignSystemComponents))
}

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "scan-frame") {
      await handleScan(Boolean(message.excludeDesignSystemComponents))
      return
    }

    if (message.type === "resolve-issues") {
      await handleResolve(Boolean(message.excludeDesignSystemComponents))
      return
    }

    if (message.type === "select-node" && typeof message.nodeId === "string") {
      await selectIssueNode(message.nodeId)
      return
    }

    if (message.type === "close") {
      figma.closePlugin()
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    postError(messageText)
  }
}
