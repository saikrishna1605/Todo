function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

if (!checkAuth()) {
    throw new Error('Authentication required');
}

let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

function addTask() {
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const time = document.getElementById('taskTime').value;

    if (!title || !time) return alert('Title and time are required!');

    const task = {
        id: Date.now(),
        title,
        description,
        time,
        completed: false,
        completedAt: null
    };

    tasks.push(task);
    saveTasks();
    updateDisplay();
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? new Date().toISOString() : null;
        saveTasks();
        updateDisplay();
    }
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    updateDisplay();
}

function renderTasks() {
    const activeTasksDiv = document.getElementById('activeTasks');
    const completedTasksDiv = document.getElementById('completedTasks');
    
    activeTasksDiv.innerHTML = '';
    completedTasksDiv.innerHTML = '';

    tasks.sort((a, b) => new Date(a.time) - new Date(b.time));

    tasks.forEach(task => {
        const taskElement = createTaskElement(task);
        if (task.completed) {
            completedTasksDiv.appendChild(taskElement);
        } else {
            activeTasksDiv.appendChild(taskElement);
        }
    });
}

function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = 'task-item';
    div.innerHTML = `
        <h3>${task.title}</h3>
        <p>${task.description}</p>
        <p>Time: ${new Date(task.time).toLocaleString()}</p>
        <button onclick="toggleTask(${task.id})">${task.completed ? 'Undo' : 'Complete'}</button>
        <button onclick="deleteTask(${task.id})">Delete</button>
    `;
    return div;
}

function updateStats() {
    const completedCount = tasks.filter(t => t.completed).length;
    const totalCount = tasks.length;
    const completionRate = totalCount ? ((completedCount / totalCount) * 100).toFixed(1) : 0;

    document.getElementById('completionRate').textContent = `${completionRate}%`;
    
    const peakTime = calculatePeakTime();
    document.getElementById('peakTime').textContent = peakTime || 'N/A';
}

function calculatePeakTime() {
    if (tasks.length === 0) return null;

    const timeCount = {};
    tasks.forEach(task => {
        const hour = new Date(task.time).getHours();
        timeCount[hour] = (timeCount[hour] || 0) + 1;
    });

    const peakHour = Object.entries(timeCount)
        .sort((a, b) => b[1] - a[1])[0][0];
    
    return `${peakHour}:00 - ${peakHour}:59`;
}

function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

initTheme();

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

document.querySelectorAll('.nav-btn').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.tasks-view, .completed-view, .stats-view').forEach(view => {
            view.classList.add('hidden');
        });
        const viewId = button.getAttribute('data-view');
        if (viewId === 'tasks') {
            document.getElementById('tasksView').classList.remove('hidden');
        } else if (viewId === 'completed') {
            document.getElementById('completedView').classList.remove('hidden');
        } else if (viewId === 'stats') {
            document.getElementById('statsView').classList.remove('hidden');
            setTimeout(renderGanttChart, 150);
        }
    });
});

let ganttChartInstance = null;

function renderGanttChart() {
    const canvas = document.getElementById('ganttChart');
    if (!canvas) return;
    if (ganttChartInstance) {
        ganttChartInstance.destroy();
    }
    const tasksByDate = {};
    tasks.forEach(task => {
        const date = new Date(task.time);
        const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (!tasksByDate[dateLabel]) tasksByDate[dateLabel] = [];
        tasksByDate[dateLabel].push(task);
    });
    const yLabels = Object.keys(tasksByDate);
    const maxTasks = Math.max(...Object.values(tasksByDate).map(arr => arr.length), 0);
    const data = [];
    yLabels.forEach((dateLabel, yIdx) => {
        tasksByDate[dateLabel].forEach((task, xIdx) => {
            data.push({
                x: xIdx + 1,
                y: dateLabel,
                backgroundColor: task.completed ? '#666666' : '#4CAF50',
                label: task.title,
                time: new Date(task.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        });
    });
    ganttChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: yLabels,
            datasets: [{
                label: 'Tasks',
                data: data,
                parsing: {
                    xAxisKey: 'x',
                    yAxisKey: 'y'
                },
                backgroundColor: data.map(d => d.backgroundColor),
                barThickness: 20
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: maxTasks + 1,
                    stepSize: 1,
                    title: {
                        display: true,
                        text: 'Task Number'
                    },
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return Number.isInteger(value) ? value : '';
                        }
                    }
                },
                y: {
                    type: 'category',
                    title: {
                        display: true,
                        text: 'Date'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => ctx[0].raw.label,
                        label: ctx => `Task #: ${ctx.raw.x}, Time: ${ctx.raw.time}`
                    }
                }
            }
        }
    });
}

function updateDisplay() {
    renderTasks();
    updateStats();
    renderGanttChart();
}

updateDisplay();

if (!document.getElementById('statsView').classList.contains('hidden')) {
    setTimeout(renderGanttChart, 100);
}
