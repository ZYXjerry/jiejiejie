// DOM 元素
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const galleryGrid = document.getElementById("galleryGrid");
const statsDisplay = document.getElementById("statsDisplay");
const clearAllBtn = document.getElementById("clearAllBtn");

// 模态框元素
let imageModal, imageModalImg, imageModalCaption, imageModalClose;
let textModal, textModalClose, textContent;

// 在 script.js 顶部添加
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function initModals() {
  // 图片模态框
  imageModal = document.getElementById("imageModal");
  imageModalImg = document.getElementById("modalImg");
  imageModalCaption = document.getElementById("modalCaption");
  imageModalClose = document.querySelector("#imageModal .modal-close");
  if (imageModal && imageModalClose) {
    imageModalClose.addEventListener("click", () => closeImageModal());
    window.addEventListener("click", (e) => {
      if (e.target === imageModal) closeImageModal();
    });
  }

  // 文本模态框
  textModal = document.getElementById("textModal");
  textModalClose = document.getElementById("textModalClose");
  textContent = document.getElementById("textContent");
  if (textModal && textModalClose) {
    textModalClose.addEventListener("click", () => closeTextModal());
    window.addEventListener("click", (e) => {
      if (e.target === textModal) closeTextModal();
    });
  }
}

function closeImageModal() {
  if (imageModal) {
    imageModal.style.display = "none";
    if (imageModalImg) imageModalImg.src = "";
  }
}

function openImageModal(url, name) {
  if (!imageModal) return;
  imageModal.style.display = "block";
  imageModalImg.src = url;
  imageModalCaption.innerText = name;
}

function closeTextModal() {
  if (textModal) {
    textModal.style.display = "none";
    if (textContent) textContent.innerText = "";
  }
}

async function openTextModal(url, name) {
  if (!textModal) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("获取文件内容失败");
    const text = await response.text();
    textContent.innerText = text;
    textModal.style.display = "block";
  } catch (error) {
    console.error("加载文本失败", error);
    alert("无法预览该文件，请下载后查看");
  }
}

// 根据文件类型决定点击预览行为
function handleFileClick(item) {
  const { type, url, originalName } = item;
  switch (type) {
    case "image":
      openImageModal(url, originalName);
      break;
    case "video":
      // 视频已有控件，无需额外操作
      break;
    case "pdf":
      // 在新窗口打开，浏览器内置PDF查看器
      window.open(url, "_blank");
      break;
    case "text":
      openTextModal(url, originalName);
      break;
    case "word":
    case "excel":
    case "powerpoint":
      // Office 文件自动下载
      const a = document.createElement("a");
      a.href = url;
      a.download = originalName;
      a.click();
      break;
    default:
      // 其他类型也提供下载
      const link = document.createElement("a");
      link.href = url;
      link.download = originalName;
      link.click();
  }
}

// 从服务器获取媒体列表并渲染
async function fetchAndRenderMedia() {
  showLoading();
  try {
    const response = await fetch("/api/media");
    if (!response.ok) throw new Error("获取列表失败");
    const mediaList = await response.json();
    renderGallery(mediaList);
    updateStats(mediaList.length);
  } catch (error) {
    console.error("加载失败", error);
    galleryGrid.innerHTML = `<div class="empty-placeholder"><div class="empty-icon">⚠️</div><p>加载失败，请检查网络或刷新页面</p></div>`;
  }
}

function showLoading() {
  galleryGrid.innerHTML = `<div class="loading-spinner">⏳ 加载中...</div>`;
}

// 获取文件类型图标或描述
function getTypeLabel(type) {
  const map = {
    image: "🖼️ 图片",
    video: "🎬 视频",
    pdf: "📄 PDF",
    text: "📝 文本",
    word: "📝 Word",
    excel: "📊 Excel",
    powerpoint: "📽️ PPT",
    other: "📁 文件",
  };
  return map[type] || "📄 文档";
}

function renderGallery(mediaList) {
  if (!mediaList.length) {
    galleryGrid.innerHTML = `<div class="empty-placeholder">
            <div class="empty-icon">📂✨</div>
            <p>暂无文件，请点击上方区域上传</p>
            <small>支持图片、视频、PDF、文本、Office文档等</small>
        </div>`;
    return;
  }

  const cardsHtml = mediaList
    .map((item) => {
      const isImage = item.type === "image";
      const isVideo = item.type === "video";
      let previewContent = "";
      if (isImage) {
        previewContent = `<img src="${item.url}" alt="${item.originalName}" loading="lazy" class="file-preview-img" data-url="${item.url}" data-name="${item.originalName}" />`;
      } else if (isVideo) {
        previewContent = `<video controls preload="metadata" src="${item.url}" class="file-preview-video"></video>`;
      } else {
        previewContent = `<div class="file-icon">${getTypeLabel(
          item.type
        )}</div>`;
      }

      // 文件名截断（最多30个字符，悬停显示全名）
      const displayName =
        item.originalName.length > 30
          ? item.originalName.slice(0, 27) + "..."
          : item.originalName;

      // 转义
      const escapedDisplayName = escapeHtml(displayName);
      const escapedOriginalName = escapeHtml(item.originalName);

      return `
        <div class="media-card" data-id="${item.id}" data-type="${item.type}" data-url="${item.url}" data-name="${item.originalName}">
            <div class="media-preview">
                ${previewContent}
            </div>
            <div class="media-info">
                <div class="file-name" title="${escapedOriginalName}">${escapedDisplayName}</div>
                <button class="delete-btn" data-id="${item.id}" title="删除">🗑️</button>
            </div>
        </div>
            `;  
    })
    .join("");

  galleryGrid.innerHTML = cardsHtml;

  // 绑定删除按钮
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (confirm("确定要删除这个文件吗？")) {
        await deleteMedia(id);
        await fetchAndRenderMedia();
      }
    });
  });

  // 卡片点击预览（通过事件委托，但这里直接给每个卡片绑定）
  document.querySelectorAll(".media-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // 防止点击删除按钮时触发
      if (e.target.classList.contains("delete-btn")) return;
      const id = card.getAttribute("data-id");
      const item = mediaList.find((m) => m.id === id);
      if (item) handleFileClick(item);
    });
  });
}

async function deleteMedia(id) {
  try {
    const response = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("删除失败");
  } catch (error) {
    console.error("删除错误", error);
    alert("删除失败，请重试");
  }
}

function updateStats(count) {
  statsDisplay.textContent = `📦 ${count} 个文件`;
}

async function uploadFiles(files) {
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "上传失败");
    }
    await fetchAndRenderMedia();
  } catch (error) {
    console.error("上传出错", error);
    alert(`上传失败: ${error.message}`);
  }
}

async function clearAllMedia() {
  if (!confirm("⚠️ 清空全部文件将删除所有文件，不可恢复！确定吗？")) return;
  try {
    const response = await fetch("/api/media", { method: "DELETE" });
    if (!response.ok) throw new Error("清空失败");
    await fetchAndRenderMedia();
  } catch (error) {
    console.error("清空失败", error);
    alert("清空失败，请重试");
  }
}

// 上传事件
uploadBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

uploadZone.addEventListener("click", (e) => {
  if (e.target === uploadBtn || uploadBtn.contains(e.target)) return;
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length) {
    uploadFiles(e.target.files);
    fileInput.value = "";
  }
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const files = e.dataTransfer.files;
  if (files.length) uploadFiles(files);
});

clearAllBtn.addEventListener("click", clearAllMedia);

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  initModals();
  fetchAndRenderMedia();
});
