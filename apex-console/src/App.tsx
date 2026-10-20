import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Shield,
  Cpu,
  Send,
  Radio,
} from 'lucide-react';

export type NodeStatus = 'Pending' | 'Running' | 'Success' | 'Failed' | 'Rolled Back';

export interface DAGTask {
  id: string;
  name: string;
  command: string;
  dependencies: string[];
  status: NodeStatus;
  duration_ms?: number;
  output?: string;
  error?: string;
}

export const App: React.FC = () => {
  const [tasks, setTasks] = useState<DAGTask[]>([
    {
      id: 'step-1',
      name: 'Initialize Sandboxed Inode',
      command: 'echo "System Initialized" > build.log',
      dependencies: [],
      status: 'Pending',
    },
    {
      id: 'step-2',
      name: 'BPE Radix AST Tokenization',
      command: 'echo "Tokenizing AST..." >> build.log',
      dependencies: ['step-1'],
      status: 'Pending',
    },
    {
      id: 'step-3',
      name: 'CoW Compiler Execution',
      command: 'echo "Compiling..." >> build.log',
      dependencies: ['step-2'],
      status: 'Pending',
    },
    {
      id: 'step-4',
      name: 'Verify Inode Integrity',
      command: 'cat build.log',
      dependencies: ['step-3'],
      status: 'Pending',
    },
  ]);

  const [prompt, setPrompt] = useState<string>('Refactor authentication middleware with zero-blocking telemetry');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<DAGTask | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [corePort, setCorePort] = useState<number>(9000);
  const [gatewayPort, setGatewayPort] = useState<number>(8080);

  // Discover ports from .apex/ports.json or fetch endpoint
  useEffect(() => {
    const discoverPorts = async () => {
      try {
        const res = await fetch('/.apex/ports.json');
        if (res.ok) {
          const data = await res.json();
          if (data.core) setCorePort(data.core);
          if (data.gateway) setGatewayPort(data.gateway);
        }
      } catch (_) {
        // Default to standard fallback ports
      }
    };
    discoverPorts();
  }, []);

  // Connect to Apex-Core WebSocket dynamically
  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: NodeJS.Timeout | null = null;

    const connectWs = () => {
      try {
        socket = new WebSocket(`ws://localhost:${corePort}/ws`);
        wsRef.current = socket;

        socket.onopen = () => {
          setIsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.tasks) {
              setTasks(data.tasks);
              setIsDispatching(false);
            }
          } catch (_) {}
        };

        socket.onclose = () => {
          setIsConnected(false);
          timer = setTimeout(connectWs, 3000);
        };

        socket.onerror = () => {
          setIsConnected(false);
          socket?.close();
        };
      } catch (_) {
        setIsConnected(false);
      }
    };

    connectWs();

    return () => {
      if (timer) clearTimeout(timer);
      if (socket) socket.close();
    };
  }, [corePort]);

  const handleDispatch = async () => {
    if (!prompt.trim()) return;
    setIsDispatching(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'dispatch', prompt }));
    } else {
      // Direct REST fallback to active dynamic core port
      try {
        await fetch(`http://localhost:${corePort}/api/dispatch`, { method: 'POST' });
      } catch (_) {
        // Local simulation fallback
        setTasks((prev) =>
          prev.map((t, idx) => ({
            ...t,
            status: idx === 0 ? 'Running' : 'Pending',
          }))
        );
      }
    }
  };

  /**
   * Status-based dynamic coloring:
   * Gray (Pending), Blue (Running), Green (Success), Red (Failed), Yellow (Rolled Back)
   */
  const getNodeColor = (status: NodeStatus) => {
    switch (status) {
      case 'Running':
        return {
          border: 'border-blue-500 shadow-blue-500/20 bg-blue-950/40',
          badge: 'bg-blue-900/60 text-blue-300 border-blue-500/40',
          dot: 'bg-blue-400 animate-ping',
        };
      case 'Success':
        return {
          border: 'border-emerald-500 shadow-emerald-500/20 bg-emerald-950/40',
          badge: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400',
        };
      case 'Failed':
        return {
          border: 'border-red-500 shadow-red-500/20 bg-red-950/40',
          badge: 'bg-red-900/60 text-red-300 border-red-500/40',
          dot: 'bg-red-400',
        };
      case 'Rolled Back':
        return {
          border: 'border-amber-400 shadow-amber-400/20 bg-amber-950/40',
          badge: 'bg-amber-900/60 text-amber-300 border-amber-400/40',
          dot: 'bg-amber-400',
        };
      case 'Pending':
      default:
        return {
          border: 'border-neutral-800 bg-[#0f111a] hover:border-neutral-700',
          badge: 'bg-neutral-800 text-neutral-400 border-neutral-700',
          dot: 'bg-neutral-500',
        };
    }
  };

  return (
    <div className="w-screen h-screen bg-[#07090e] text-neutral-100 flex flex-col font-mono selection:bg-amber-500/30">
      {/* HEADER STATUS BAR */}
      <header className="h-12 border-b border-[#1f2438] bg-[#090b13] px-5 flex items-center justify-between text-xs shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <span className="font-bold tracking-widest text-white text-[11px] uppercase">
            APEX // STEERING CONSOLE
          </span>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-400 text-[10px]">L7 INFERENCE & KERNEL SUPERVISOR</span>
        </div>

        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-black/60 border border-[#1f2438] rounded">
            <Radio className={`w-3 h-3 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`} />
            <span>CORE WS: {isConnected ? `CONNECTED (${corePort})` : 'STANDBY'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 border border-[#1f2438] rounded text-neutral-300">
            <Shield className="w-3 h-3 text-cyan-400" />
            <span>ENCLAVE: ACTIVE</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 border border-[#1f2438] rounded text-neutral-300">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span>WARDEN: IDLE (32% RAM)</span>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT CANVAS */}
      <main className="flex-1 flex overflow-hidden">
        {/* LEFT: DAG WORKFLOW CANVAS */}
        <section className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto border-r border-[#1f2438]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">
                [ DIRECTED ACYCLIC GRAPH ]
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5 tracking-tight">
                Execution Pipeline & MemoryCOW Branches
              </h2>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded border border-[#1f2438] bg-[#0c0e17] text-neutral-400">
              {tasks.length} PIPELINE STEPS
            </span>
          </div>

          {/* DAG NODES GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map((task, idx) => {
              const theme = getNodeColor(task.status);
              const isSelected = selectedTask?.id === task.id;

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer relative flex flex-col justify-between shadow-lg ${
                    isSelected ? 'ring-2 ring-amber-400' : ''
                  } ${theme.border}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] text-neutral-400">STEP 0{idx + 1}</span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase flex items-center gap-1.5 ${theme.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
                        {task.status}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white tracking-tight mb-1">
                      {task.name}
                    </h3>

                    <code className="text-[10px] text-neutral-400 bg-black/50 px-2 py-1 rounded block truncate border border-[#1f2438]/50">
                      $ {task.command}
                    </code>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1f2438]/60 flex items-center justify-between text-[10px] text-neutral-400">
                    <span>Deps: {task.dependencies.length > 0 ? task.dependencies.join(', ') : 'Root'}</span>
                    <span>{task.duration_ms ? `${task.duration_ms.toFixed(1)}ms` : '---'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* INODE INSPECTOR FOOTER */}
          <div className="p-3 bg-[#0c0e17] border border-[#1f2438] rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-neutral-400">
                COW SNAPSHOTS: <strong className="text-white">APFS native clonefile(2) ACTIVE</strong>
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-neutral-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> Running
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Success
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Failed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Rolled Back
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT: DISPATCH DOCK & NODE INSPECTION */}
        <aside className="w-96 p-6 flex flex-col justify-between bg-[#090b13] shrink-0">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">
                [ TASK DISPATCHER ]
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">Steer Autonomous Swarm</h3>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-neutral-400 uppercase">Workflow Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full bg-[#07090e] border border-[#1f2438] rounded p-3 text-xs text-white focus:outline-none focus:border-amber-400 resize-none font-mono"
                placeholder="Enter autonomous agent instructions..."
              />
            </div>

            <button
              onClick={handleDispatch}
              disabled={isDispatching}
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs uppercase rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-amber-400/10"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isDispatching ? 'EXECUTING PIPELINE...' : 'DISPATCH WORKFLOW'}</span>
            </button>

            {/* NODE INSPECTOR DRAWER */}
            {selectedTask && (
              <div className="mt-6 p-4 bg-[#07090e] border border-[#1f2438] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs border-b border-[#1f2438] pb-2">
                  <span className="font-bold text-white truncate">{selectedTask.name}</span>
                  <span className="text-[10px] text-amber-400">{selectedTask.status}</span>
                </div>
                <div className="text-[10px] space-y-1 text-neutral-400">
                  <div>ID: <code className="text-white">{selectedTask.id}</code></div>
                  <div>Duration: <span className="text-white">{selectedTask.duration_ms ? `${selectedTask.duration_ms.toFixed(2)}ms` : 'N/A'}</span></div>
                  {selectedTask.output && (
                    <div className="pt-2">
                      <span className="text-neutral-500 uppercase text-[9px]">Stdout:</span>
                      <pre className="bg-black/60 p-2 rounded text-[10px] text-emerald-400 overflow-x-auto mt-1">
                        {selectedTask.output}
                      </pre>
                    </div>
                  )}
                  {selectedTask.error && (
                    <div className="pt-1">
                      <span className="text-red-400 uppercase text-[9px]">Stderr:</span>
                      <pre className="bg-red-950/30 p-2 rounded text-[10px] text-red-300 overflow-x-auto mt-1 border border-red-900/40">
                        {selectedTask.error}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border border-[#1f2438] bg-black/40 rounded text-[10px] text-neutral-500 space-y-1">
            <div>APEX STACK RUNTIME: v0.1.0</div>
            <div>LOCAL PROXY: localhost:{gatewayPort}</div>
            <div>ORCHESTRATOR: localhost:{corePort}</div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;
