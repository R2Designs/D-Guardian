figma.showUI(__html__, { width: 420, height: 640, themeColors: true });

const ALLOWED_FONT_SIZES = new Set([8, 10, 12, 14, 16, 20]);

function postError(error) {
  const message = error instanceof Error ? error.message : String(error);
  figma.notify("Design Audit error: " + message, { error: true });
  figma.ui.postMessage({
    type: "audit-error",
    message
  });
}

function isMultipleOfEight(value) {
  return Number.isFinite(value) && value % 8 === 0;
}

function isAllowedFontSize(value) {
  return ALLOWED_FONT_SIZES.has(value) || (value > 20 && isMultipleOfEight(value));
}

function createIssue(category, title, detail, node) {
  return {
    id: `${category}-${node.id}-${title}`,
    category,
    title,
    detail,
    nodeId: node.id,
    nodeName: node.name || node.type,
    nodeType: node.type
  };
}

function getVisibleSolidFills(node) {
  if (!("fills" in node) || figma.mixed === node.fills || !Array.isArray(node.fills)) {
    return [];
  }

  return node.fills.filter((paint) => {
    const opacity = typeof paint.opacity === "number" ? paint.opacity : 1;
    return paint.type === "SOLID" && paint.visible !== false && opacity > 0;
  });
}

function hasColorStyle(node) {
  if (!("fillStyleId" in node)) {
    return true;
  }

  return typeof node.fillStyleId === "string" && node.fillStyleId.length > 0;
}

function auditTypography(node, issues) {
  if (node.type !== "TEXT") {
    return;
  }

  const fontSize = node.fontSize;
  if (typeof fontSize !== "number") {
    return;
  }

  if (!isAllowedFontSize(fontSize)) {
    issues.push(
      createIssue(
        "Typography",
        "Font size is off the approved scale",
        `Uses ${fontSize}px. Allowed sizes are 8, 10, 12, 14, 16, 20, then multiples of 8 above 20.`,
        node
      )
    );
  }
}

function auditSpacing(node, issues) {
  if (node.type !== "FRAME") {
    return;
  }

  const spacingProblems = [];
  const spacingChecks = [
    ["paddingTop", node.paddingTop],
    ["paddingRight", node.paddingRight],
    ["paddingBottom", node.paddingBottom],
    ["paddingLeft", node.paddingLeft]
  ];

  for (const [label, value] of spacingChecks) {
    if (typeof value === "number" && value > 0 && !isMultipleOfEight(value)) {
      spacingProblems.push(`${label}: ${value}`);
    }
  }

  if (node.layoutMode !== "NONE" && node.itemSpacing > 0 && !isMultipleOfEight(node.itemSpacing)) {
    spacingProblems.push(`itemSpacing: ${node.itemSpacing}`);
  }

  if (spacingProblems.length > 0) {
    issues.push(
      createIssue(
        "Layout",
        "Spacing is off the 8pt grid",
        `Non-compliant values: ${spacingProblems.join(", ")}.`,
        node
      )
    );
  }
}

function auditColors(node, issues) {
  const fills = getVisibleSolidFills(node);
  if (fills.length === 0) {
    return;
  }

  if (!hasColorStyle(node)) {
    issues.push(
      createIssue(
        "Colors",
        "Fill is not using a color style",
        `Found ${fills.length} visible solid fill${fills.length === 1 ? "" : "s"} without an applied color style.`,
        node
      )
    );
  }
}

function auditAutoLayout(node, issues) {
  if (node.type !== "FRAME") {
    return;
  }

  if (node.layoutMode === "NONE") {
    issues.push(
      createIssue(
        "Layout",
        "Frame is missing auto layout",
        "This frame uses manual layout instead of auto layout.",
        node
      )
    );
  }
}

function runAudit() {
  const issues = {
    Typography: [],
    Layout: [],
    Colors: []
  };

  const nodes = figma.currentPage.findAll();
  for (const node of nodes) {
    auditTypography(node, issues.Typography);
    auditSpacing(node, issues.Layout);
    auditColors(node, issues.Colors);
    auditAutoLayout(node, issues.Layout);
  }

  const totalIssues = issues.Typography.length + issues.Layout.length + issues.Colors.length;
  const healthScore = Math.max(0, Math.min(100, 100 - totalIssues * 2));

  return {
    healthScore,
    totalIssues,
    issues
  };
}

function postResults() {
  try {
    const result = runAudit();
    figma.ui.postMessage({
      type: "audit-results",
      result,
      pageName: figma.currentPage.name
    });
  } catch (error) {
    postError(error);
  }
}

function selectNode(nodeId) {
  try {
    const node = figma.getNodeById(nodeId);
    if (!node || !("type" in node) || !("parent" in node)) {
      return;
    }

    if ("removed" in node && node.removed) {
      return;
    }

    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  } catch (error) {
    postError(error);
  }
}

figma.on("currentpagechange", () => {
  postResults();
});

figma.ui.onmessage = (message) => {
  if (message.type === "run-audit") {
    postResults();
    return;
  }

  if (message.type === "select-node" && typeof message.nodeId === "string") {
    selectNode(message.nodeId);
    return;
  }

  if (message.type === "close") {
    figma.closePlugin();
  }
};

try {
  postResults();
} catch (error) {
  postError(error);
}
