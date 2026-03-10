figma.showUI(__html__, { width: 460, height: 740, themeColors: true });

const ALLOWED_FONT_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 40, 48];
const GRID_SIZE = 8;
const FRAME_GAP = 120;
const LINE_HEIGHT_RATIO = 1.4;
const FLOAT_TOLERANCE = 0.01;
const SPACING_CONFIG = {
  tokens: []
};

function createIssue(category, kind, node, description) {
  return {
    id: kind + "-" + node.id + "-" + description,
    category,
    kind,
    nodeId: node.id,
    nodeName: node.name || node.type,
    nodeType: node.type,
    description
  };
}

function isFrameNode(node) {
  return node && "type" in node && node.type === "FRAME";
}

function getSelectedFrame() {
  if (figma.currentPage.selection.length !== 1) {
    return null;
  }

  const selected = figma.currentPage.selection[0];
  return isFrameNode(selected) ? selected : null;
}

function collectNodes(root) {
  const nodes = [root];
  if ("children" in root) {
    for (const child of root.children) {
      nodes.push.apply(nodes, collectNodes(child));
    }
  }
  return nodes;
}

function normalizeNumber(value) {
  return Number(value.toFixed(2));
}

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapToToken(value, tokens) {
  return tokens.reduce((closest, token) => {
    return Math.abs(token - value) < Math.abs(closest - value) ? token : closest;
  }, tokens[0]);
}

function closestFontSize(value) {
  return ALLOWED_FONT_SIZES.reduce((closest, current) => {
    return Math.abs(current - value) < Math.abs(closest - value) ? current : closest;
  }, ALLOWED_FONT_SIZES[0]);
}

function isAllowedFontSize(value) {
  return ALLOWED_FONT_SIZES.some((allowed) => Math.abs(allowed - value) < FLOAT_TOLERANCE);
}

function getVisibleSolidPaint(node) {
  if (!("fills" in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) {
    return null;
  }

  for (const paint of node.fills) {
    const opacity = typeof paint.opacity === "number" ? paint.opacity : 1;
    if (paint.type === "SOLID" && paint.visible !== false && opacity > 0) {
      return paint;
    }
  }

  return null;
}

function hasFillStyle(node) {
  return "fillStyleId" in node && typeof node.fillStyleId === "string" && node.fillStyleId.length > 0;
}

function getNodeCornerRadius(node) {
  if (!("cornerRadius" in node) || typeof node.cornerRadius !== "number") {
    return null;
  }

  return node.cornerRadius;
}

function isLineHeightNormalized(node, fontSize) {
  if (node.lineHeight === figma.mixed) {
    return false;
  }

  if (node.lineHeight.unit !== "PIXELS") {
    return false;
  }

  const expected = fontSize * LINE_HEIGHT_RATIO;
  return Math.abs(node.lineHeight.value - expected) < 0.1;
}

function scanFrame(frame) {
  const issues = {
    Typography: [],
    Spacing: [],
    Colors: []
  };

  const nodes = collectNodes(frame);
  for (const node of nodes) {
    if (node.type === "TEXT") {
      const fontSize = node.fontSize;
      if (typeof fontSize === "number") {
        if (!isAllowedFontSize(fontSize)) {
          issues.Typography.push(
            createIssue(
              "Typography",
              "font-scale",
              node,
              "Font size " + normalizeNumber(fontSize) + "px is outside the allowed scale."
            )
          );
        }

        if (!isLineHeightNormalized(node, fontSize)) {
          issues.Typography.push(
            createIssue(
              "Typography",
              "line-height",
              node,
              "Line height should be " + normalizeNumber(fontSize * LINE_HEIGHT_RATIO) + " px."
            )
          );
        }
      }
    }

    if (node.type === "FRAME") {
      const spacingProblems = [];
      const checks = [
        ["paddingTop", node.paddingTop],
        ["paddingBottom", node.paddingBottom],
        ["paddingLeft", node.paddingLeft],
        ["paddingRight", node.paddingRight]
      ];

      for (const entry of checks) {
        const label = entry[0];
        const value = entry[1];
        if (value % GRID_SIZE !== 0) {
          spacingProblems.push(label + ": " + normalizeNumber(value));
        }
      }

      if (node.layoutMode !== "NONE" && node.itemSpacing % GRID_SIZE !== 0) {
        spacingProblems.push("itemSpacing: " + normalizeNumber(node.itemSpacing));
      }

      const cornerRadius = getNodeCornerRadius(node);
      if (typeof cornerRadius === "number" && cornerRadius % GRID_SIZE !== 0) {
        spacingProblems.push("cornerRadius: " + normalizeNumber(cornerRadius));
      }

      if (spacingProblems.length > 0) {
        issues.Spacing.push(
          createIssue("Spacing", "spacing", node, "Values off grid: " + spacingProblems.join(", ") + ".")
        );
      }
    }

    const solidPaint = getVisibleSolidPaint(node);
    if (solidPaint && !hasFillStyle(node)) {
      issues.Colors.push(
        createIssue("Colors", "color-style", node, "Visible solid fill is not using a local color style.")
      );
    }
  }

  return {
    frameId: frame.id,
    frameName: frame.name,
    totalIssues: issues.Typography.length + issues.Spacing.length + issues.Colors.length,
    issues
  };
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function getClosestPaintStyle(paint, styles) {
  let closest = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const style of styles) {
    if (!Array.isArray(style.paints)) {
      continue;
    }

    const stylePaint = style.paints.find((entry) => entry.type === "SOLID");
    if (!stylePaint || stylePaint.type !== "SOLID") {
      continue;
    }

    const distance = colorDistance(paint.color, stylePaint.color);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = style;
    }
  }

  return closest;
}

function getTextStyleFontSize(style) {
  if ("fontSize" in style && typeof style.fontSize === "number") {
    return style.fontSize;
  }
  return null;
}

function getClosestTextStyle(fontSize, styles) {
  let closest = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const style of styles) {
    const styleFontSize = getTextStyleFontSize(style);
    if (typeof styleFontSize !== "number") {
      continue;
    }

    const distance = Math.abs(styleFontSize - fontSize);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = style;
    }
  }

  return closest;
}

async function loadFontsForTextNode(node) {
  const fontKeys = [];

  function pushFont(font) {
    const key = font.family + "::" + font.style;
    if (fontKeys.indexOf(key) === -1) {
      fontKeys.push(key);
    }
  }

  if (node.characters.length === 0) {
    if (node.fontName !== figma.mixed) {
      pushFont(node.fontName);
    }
  } else {
    const fonts = node.getRangeAllFontNames(0, node.characters.length);
    for (const font of fonts) {
      pushFont(font);
    }
  }

  for (const key of fontKeys) {
    const parts = key.split("::");
    await figma.loadFontAsync({ family: parts[0], style: parts[1] });
  }
}

function resolveSpacingValue(value, useDesignSystem) {
  if (useDesignSystem && SPACING_CONFIG.tokens.length > 0) {
    return snapToToken(value, SPACING_CONFIG.tokens);
  }

  return snapToGrid(value);
}

async function applyTypographyFix(node, useDesignSystem, textStyles) {
  const fontSize = node.fontSize;
  if (typeof fontSize !== "number") {
    return;
  }

  await loadFontsForTextNode(node);

  if (useDesignSystem) {
    const closestTextStyle = getClosestTextStyle(fontSize, textStyles);
    if (closestTextStyle) {
      await node.setTextStyleIdAsync(closestTextStyle.id);
    } else {
      node.fontSize = closestFontSize(fontSize);
    }
  } else {
    node.fontSize = closestFontSize(fontSize);
  }

  const resolvedFontSize = typeof node.fontSize === "number" ? node.fontSize : closestFontSize(fontSize);
  node.lineHeight = {
    unit: "PIXELS",
    value: normalizeNumber(resolvedFontSize * LINE_HEIGHT_RATIO)
  };
}

function applySpacingFix(node, useDesignSystem) {
  node.paddingTop = resolveSpacingValue(node.paddingTop, useDesignSystem);
  node.paddingBottom = resolveSpacingValue(node.paddingBottom, useDesignSystem);
  node.paddingLeft = resolveSpacingValue(node.paddingLeft, useDesignSystem);
  node.paddingRight = resolveSpacingValue(node.paddingRight, useDesignSystem);

  if (node.layoutMode !== "NONE") {
    node.itemSpacing = resolveSpacingValue(node.itemSpacing, useDesignSystem);
  }

  const cornerRadius = getNodeCornerRadius(node);
  if (typeof cornerRadius === "number") {
    node.cornerRadius = resolveSpacingValue(cornerRadius, useDesignSystem);
  }
}

async function applyColorFix(node, paintStyles) {
  const solidPaint = getVisibleSolidPaint(node);
  if (!solidPaint || hasFillStyle(node)) {
    return;
  }

  const closestStyle = getClosestPaintStyle(solidPaint, paintStyles);
  if (closestStyle && "setFillStyleIdAsync" in node) {
    await node.setFillStyleIdAsync(closestStyle.id);
  }
}

async function resolveFrame(frame, useDesignSystem) {
  const duplicate = frame.clone();
  duplicate.name = frame.name + " – Guardian Clean";
  duplicate.x = frame.x + frame.width + FRAME_GAP;
  duplicate.y = frame.y;

  const localPaintStyles = await figma.getLocalPaintStylesAsync();
  const localTextStyles = await figma.getLocalTextStylesAsync();
  const duplicateNodes = collectNodes(duplicate);

  for (const node of duplicateNodes) {
    if (node.type === "TEXT") {
      await applyTypographyFix(node, useDesignSystem, localTextStyles);
    }

    if (node.type === "FRAME") {
      applySpacingFix(node, useDesignSystem);
    }

    await applyColorFix(node, localPaintStyles);
  }

  return duplicate;
}

function postScan(result) {
  figma.ui.postMessage({
    type: "scan-results",
    result
  });
}

function postStatus(message) {
  figma.ui.postMessage({
    type: "plugin-status",
    message
  });
}

function postError(message) {
  figma.notify(message, { error: true });
  figma.ui.postMessage({
    type: "plugin-error",
    message
  });
}

async function selectIssueNode(nodeId) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !("type" in node) || !("parent" in node) || ("removed" in node && node.removed)) {
    return;
  }

  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

async function handleScan() {
  const frame = getSelectedFrame();
  if (!frame) {
    postError("Select a frame to scan");
    return;
  }

  postStatus("");
  postScan(scanFrame(frame));
}

async function handleResolve(useDesignSystem) {
  const frame = getSelectedFrame();
  if (!frame) {
    postError("Select a frame to scan");
    return;
  }

  const duplicate = await resolveFrame(frame, useDesignSystem);
  figma.currentPage.selection = [duplicate];
  figma.viewport.scrollAndZoomIntoView([duplicate]);
  figma.notify("Guardian Clean frame created");
  postStatus("Guardian Clean frame created");
  postScan(scanFrame(duplicate));
}

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "scan-frame") {
      await handleScan();
      return;
    }

    if (message.type === "resolve-issues") {
      await handleResolve(Boolean(message.useDesignSystem));
      return;
    }

    if (message.type === "select-node" && typeof message.nodeId === "string") {
      await selectIssueNode(message.nodeId);
      return;
    }

    if (message.type === "close") {
      figma.closePlugin();
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    postError(messageText);
  }
};
