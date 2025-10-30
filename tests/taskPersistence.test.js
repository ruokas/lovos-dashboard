import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataPersistenceManager } from '../persistence/dataPersistenceManager.js';
import { TaskData, TASK_STATUS } from '../models/taskData.js';

function createLocalStorageMock() {
  let store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = value;
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
}

function createThenableResponse(response) {
  return {
    order: vi.fn(() => createThenableResponse(response)),
    limit: vi.fn(() => createThenableResponse(response)),
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
    catch: (reject) => Promise.resolve(response).catch(reject),
    finally: (handler) => Promise.resolve(response).finally(handler),
  };
}

function createSupabaseTaskMock() {
  const tasks = [];

  const taskSelectData = [
    {
      id: 'task-remote-1',
      category: 'cleaning',
      description: 'Patikrinti EKG aparatą',
      priority: 1,
      status: TASK_STATUS.PENDING,
      due_at: '2024-01-01T08:00:00.000Z',
      assigned_to: 'nurse@example.com',
      metadata: {},
      task_events: [
        {
          id: 'event-remote-1',
          event_type: 'created',
          status: TASK_STATUS.PENDING,
          notes: 'Sukūrė sistema',
          created_by: 'nurse@example.com',
          metadata: {},
          created_at: '2023-12-31T21:00:00.000Z',
        },
      ],
    },
  ];

  const taskSelect = vi.fn(() => createThenableResponse({ data: taskSelectData, error: null }));
  const taskUpsertSelect = vi.fn(async () => ({ data: [{ id: 'task-remote-upsert' }], error: null }));
  const taskUpsert = vi.fn(() => ({ select: taskUpsertSelect }));
  const taskUpdateEq = vi.fn(async () => ({ data: null, error: null }));
  const taskUpdate = vi.fn(() => ({ eq: taskUpdateEq }));

  const taskEventsInsertSelect = vi.fn(async () => ({ data: [{ created_at: '2024-01-02T10:00:00.000Z' }], error: null }));
  const taskEventsInsert = vi.fn(() => ({ select: taskEventsInsertSelect }));

  const taskTemplatesSelect = vi.fn(() => createThenableResponse({ data: [], error: null }));

  const from = vi.fn((table) => {
    switch (table) {
      case 'tasks':
        return {
          select: taskSelect,
          upsert: taskUpsert,
          update: taskUpdate,
        };
      case 'task_events':
        return {
          insert: taskEventsInsert,
        };
      case 'task_templates':
        return {
          select: taskTemplatesSelect,
        };
      default:
        throw new Error(`Unexpected table requested: ${table}`);
    }
  });

  return {
    from,
    __mocks: {
      taskSelect,
      taskUpsert,
      taskUpsertSelect,
      taskUpdate,
      taskUpdateEq,
      taskEventsInsert,
      taskEventsInsertSelect,
      taskTemplatesSelect,
      tasks,
    },
  };
}

describe('DataPersistenceManager task persistence – offline režimas', () => {
  let manager;

  beforeEach(() => {
    global.localStorage = createLocalStorageMock();
    manager = new DataPersistenceManager({ client: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('išsaugo užduotį lokaliai ir grąžina istoriją', async () => {
    const taskId = await manager.saveTask(
      {
        category: 'cleaning',
        description: 'Sutvarkyti monitorių zoną',
        priority: 1,
        assignedTo: 'nurse@example.com',
      },
      {
        notes: 'Rankinis įrašas',
        createdBy: 'nurse@example.com',
      },
    );

    expect(taskId).toMatch(/local-task-/);

    const tasks = await manager.loadTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toBeInstanceOf(TaskData);
    expect(tasks[0].history).toHaveLength(1);
    expect(tasks[0].history[0]).toMatchObject({
      type: 'created',
      description: 'Rankinis įrašas',
    });
  });

  it('pažymi užduotį kaip užbaigtą lokaliame saugykloje', async () => {
    const taskId = await manager.saveTask({ description: 'Patikrinti defibriliatorių' });
    const firstLoad = await manager.loadTasks();
    expect(firstLoad[0].status).toBe(TASK_STATUS.PENDING);

    const result = await manager.completeTask(taskId, {
      notes: 'Baigta',
      completedBy: 'nurse@example.com',
    });

    expect(result).toBe(true);
    const tasks = await manager.loadTasks();
    expect(tasks[0].status).toBe(TASK_STATUS.COMPLETED);
    expect(tasks[0].history[tasks[0].history.length - 1]).toMatchObject({
      type: 'completed',
      description: 'Baigta',
    });
  });

  it('ribojamas maksimalus vietinių užduočių skaičius', async () => {
    const generatedIds = [];
    for (let i = 0; i < 505; i += 1) {
      const id = await manager.saveTask(
        { description: `Užduotis ${i}` },
        { eventTimestamp: new Date(Date.now() + i * 1000).toISOString() },
      );
      generatedIds.push(id);
    }

    const tasks = await manager.loadTasks();
    expect(tasks.length).toBe(500);
    expect(tasks.some((task) => task.id === generatedIds[0])).toBe(false);
    expect(tasks.some((task) => task.id === generatedIds[generatedIds.length - 1])).toBe(true);
  });

  it('migracijos versija atnaujinama iki naujos reikšmės', async () => {
    localStorage.setItem('bed-management-data-version', '1.0.0');
    expect(manager.needsMigration()).toBe(true);
    await manager.migrateData();
    expect(localStorage.getItem('bed-management-data-version')).toBe('2.1.0');
    expect(manager.needsMigration()).toBe(false);
  });
});

describe('DataPersistenceManager task persistence – Supabase režimas', () => {
  let supabaseMock;
  let manager;

  beforeEach(() => {
    supabaseMock = createSupabaseTaskMock();
    global.localStorage = createLocalStorageMock();
    manager = new DataPersistenceManager({ client: supabaseMock });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('įkelia užduotis iš Supabase ir transformuoja į TaskData', async () => {
    const tasks = await manager.loadTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toBeInstanceOf(TaskData);
    expect(tasks[0].history[0].type).toBe('created');
  });

  it('įrašo naują užduotį į Supabase', async () => {
    const savedId = await manager.saveTask(
      {
        category: 'supplies',
        description: 'Papildyti švirkštus',
        priority: 2,
        assignedTo: 'nurse@example.com',
      },
      {
        notes: 'Įtraukta per valdymo skydelį',
        createdBy: 'nurse@example.com',
        source: 'ui',
      },
    );

    expect(savedId).toBe('task-remote-upsert');
    expect(supabaseMock.__mocks.taskUpsert).toHaveBeenCalledTimes(1);
    expect(supabaseMock.__mocks.taskEventsInsert).toHaveBeenCalledTimes(1);
    const [eventPayload] = supabaseMock.__mocks.taskEventsInsert.mock.calls[0];
    expect(eventPayload).toHaveLength(1);
    expect(eventPayload[0]).toMatchObject({
      event_type: 'created',
      notes: 'Įtraukta per valdymo skydelį',
      created_by: 'nurse@example.com',
    });
  });

  it('užbaigia užduotį per Supabase', async () => {
    const result = await manager.completeTask('task-remote-1', {
      notes: 'Patvirtinta',
      completedBy: 'nurse@example.com',
    });

    expect(result).toBe(true);
    expect(supabaseMock.__mocks.taskUpdate).toHaveBeenCalledTimes(1);
    expect(supabaseMock.__mocks.taskEventsInsert).toHaveBeenCalledTimes(1);
    const completionPayload = supabaseMock.__mocks.taskEventsInsert.mock.calls[0][0][0];
    expect(completionPayload).toMatchObject({
      event_type: 'completed',
      notes: 'Patvirtinta',
      created_by: 'nurse@example.com',
    });
  });
});
