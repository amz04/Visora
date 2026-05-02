let currentPage = 1;
let filteredMachines = [];

function applyFilters() {
  const q = document.querySelector('.search-input').value.trim().toLowerCase();
  const deptVal = document.querySelectorAll('.filter-select')[0].value;
  const statusVal = document.querySelectorAll('.filter-select')[1].value;
  const typeVal = document.querySelectorAll('.filter-select')[2].value;

  filteredMachines = MACHINES.filter(m => {
    const effectiveStatus = getEffectiveStatus(m.id);
    const matchQ = !q || m.name.toLowerCase().includes(q)
      || m.department.toLowerCase().includes(q)
      || m.type.toLowerCase().includes(q)
      || m.location.toLowerCase().includes(q);
    const matchDept = deptVal === 'All Departments' || m.department === deptVal;
    const matchStatus = statusVal === 'All Statuses' || getStatusLabel(effectiveStatus) === statusVal;
    const matchType = typeVal === 'All Types' || m.type === typeVal;
    return matchQ && matchDept && matchStatus && matchType;
  });

  currentPage = 1;
  renderGrid();
}

function getMachinesForPage(page) {
  const start = (page - 1) * 8;
  return filteredMachines.slice(start, start + 8);
}

function getTotalPages() {
  return Math.max(1, Math.ceil(filteredMachines.length / 8));
}

function renderMachineCard(machine) {
  const effectiveStatus = getEffectiveStatus(machine.id);
  const statusClass = getStatusClass(effectiveStatus);
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
          <button class="btn-details" onclick="event.stopPropagation(); openModal(${machine.id})">
            Details →
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderGrid() {
  const grid = document.getElementById('machineGrid');
  const machines = getMachinesForPage(currentPage);
  if (machines.length === 0) {
    grid.innerHTML = `<div class="no-results">No machines match your search.</div>`;
  } else {
    grid.innerHTML = machines.map(renderMachineCard).join('');
  }
  lucide.createIcons();
  updatePagination();
}

function updatePagination() {
  const total = getTotalPages();
  document.getElementById('prevBtn').disabled = currentPage === 1;
  document.getElementById('nextBtn').disabled = currentPage === total;
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${total}`;
}

document.getElementById('prevBtn').addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; renderGrid(); }
});
document.getElementById('nextBtn').addEventListener('click', () => {
  if (currentPage < getTotalPages()) { currentPage++; renderGrid(); }
});

// Search + filter wiring
let searchDebounce = null;
document.querySelector('.search-input').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(applyFilters, 200);
});
document.querySelectorAll('.filter-select').forEach(sel => {
  sel.addEventListener('change', applyFilters);
});

// Modal
let activeModalId = null;

function openModal(machineId) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  activeModalId = machineId;

  const effectiveStatus = getEffectiveStatus(machineId);
  const statusColor = getStatusColor(effectiveStatus);
  const statusLabel = getStatusLabel(effectiveStatus);

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

  document.getElementById('modalAiBtn').href = `machine.html?id=${machine.id}&focus=chat`;

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

applyFilters();
