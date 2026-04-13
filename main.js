let currentPage = 1;
const PAGE_SIZE_1 = 8;
const PAGE_SIZE_2 = 4;
const TOTAL_PAGES = 2;

function getMachinesForPage(page) {
  if (page === 1) return MACHINES.slice(0, 8);
  return MACHINES.slice(8, 12);
}

function renderMachineCard(machine) {
  const statusClass = getStatusClass(machine.status);
  const statusLabel = getStatusLabel(machine.status);
  const machineUrl = `machine.html?id=${machine.id}`;
  const machineUrlChat = `machine.html?id=${machine.id}&focus=chat`;

  const imageHtml = machine.image
    ? `<img src="${machine.image}" alt="${machine.name}">`
    : `<div class="machine-card-image-placeholder">
        <i data-lucide="cpu" style="width:40px;height:40px;opacity:0.3;"></i>
       </div>`;

  return `
    <div class="machine-card" data-id="${machine.id}" onclick="openModal(${machine.id})">
      <div class="machine-card-image">
        ${imageHtml}
        <div class="machine-card-image-overlay"></div>
        <div class="status-dot ${statusClass}"></div>
      </div>
      <div class="machine-card-body">
        <div class="machine-card-name">${machine.name}</div>
        <div class="machine-card-meta">${machine.department} · ${machine.location}</div>
        <div class="machine-card-serviced">Last serviced: ${machine.lastServicedAgo}</div>
        <div class="machine-card-divider"></div>
        <div class="machine-card-actions">
          <a href="${machineUrlChat}" class="btn-ai" onclick="event.stopPropagation()">
            <i data-lucide="zap" style="width:12px;height:12px;"></i>
            Ask AI
          </a>
          <a href="${machineUrl}" class="btn-details" onclick="event.stopPropagation()">
            Details →
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderGrid() {
  const grid = document.getElementById('machineGrid');
  const machines = getMachinesForPage(currentPage);
  grid.innerHTML = machines.map(renderMachineCard).join('');
  lucide.createIcons();
  updatePagination();
}

function updatePagination() {
  document.getElementById('prevBtn').disabled = currentPage === 1;
  document.getElementById('nextBtn').disabled = currentPage === TOTAL_PAGES;
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${TOTAL_PAGES}`;
}

document.getElementById('prevBtn').addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; renderGrid(); }
});
document.getElementById('nextBtn').addEventListener('click', () => {
  if (currentPage < TOTAL_PAGES) { currentPage++; renderGrid(); }
});

// Modal
let activeModalId = null;

function openModal(machineId) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  activeModalId = machineId;

  const statusClass = getStatusClass(machine.status);
  const statusLabel = getStatusLabel(machine.status);
  const statusColor = getStatusColor(machine.status);

  const imageWrap = document.getElementById('modalImageWrap');
  if (machine.image) {
    imageWrap.innerHTML = `<img src="${machine.image}" class="modal-image" alt="${machine.name}">`;
  } else {
    imageWrap.innerHTML = `
      <div class="modal-image-placeholder">
        <i data-lucide="cpu" style="width:56px;height:56px;opacity:0.25;"></i>
      </div>`;
  }

  document.getElementById('modalStatusBadge').innerHTML = `
    <div class="dot" style="width:8px;height:8px;border-radius:50%;background:${statusColor};"></div>
    <span style="color:${statusColor};font-size:13px;font-weight:500;">${statusLabel}</span>
  `;
  document.getElementById('modalTypeBadge').textContent = machine.type;
  document.getElementById('modalName').textContent = machine.name;
  document.getElementById('modalDept').textContent = machine.department;
  document.getElementById('modalType').textContent = machine.type;
  document.getElementById('modalLastServiced').textContent = machine.lastServiced;
  document.getElementById('modalAvgDowntime').textContent = machine.avgDowntime;
  document.getElementById('modalSessions').textContent = `${machine.sessionsCount} sessions`;

  const machineUrl = `machine.html?id=${machine.id}`;
  document.getElementById('modalAiBtn').href = `machine.html?id=${machine.id}&focus=chat`;
  document.getElementById('modalDetailsBtn').href = machineUrl;

  document.getElementById('cardModal').classList.add('open');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('cardModal').classList.remove('open');
  activeModalId = null;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cardModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('cardModal')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

renderGrid();
