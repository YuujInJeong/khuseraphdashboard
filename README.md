# KHU Seraph Dashboard - VSCode Extension

🚀 **완전 초보자를 위한 GPU 서버 관리 도구**

리눅스를 몰라도 쉽게! 경희대학교 Seraph GPU 서버를 웹 브라우저처럼 편리하게 사용할 수 있는 VSCode Extension입니다.

![GitHub](https://img.shields.io/badge/license-MIT-blue.svg)
![VSCode](https://img.shields.io/badge/VSCode-1.74.0+-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)

## Features

### 🔌 SSH Connection Management
- Easy configuration of SSH connection settings (host, port, username, remote path)
- Support for both password and private key authentication
- Real-time connection status display in the status bar
- Automatic connection testing and validation

### 📊 GPU Resource Monitoring
- Real-time GPU status visualization using `slurm-gres-viz`
- Interactive dashboard showing GPU availability across nodes
- CPU and memory usage metrics for each node
- Auto-refresh functionality with configurable intervals
- Click to select GPU nodes for job submission

### 🎛️ Status Bar Integration
- Live connection status indicator
- Quick access to connection toggle
- Visual feedback with color-coded states:
  - 🔴 Not Connected / Failed
  - 🟡 Connecting
  - 🟢 Connected

### 💼 Job Management
- Slurm job submission with interactive UI
- Automatic script.sh generation with proper SBATCH headers
- Real-time job monitoring in Activity Bar TreeView
- Job status tracking (Running, Pending, Completed, Failed)
- One-click job cancellation with confirmation
- Job log viewing with real-time updates and syntax highlighting
- Copy job IDs to clipboard for easy reference

### 📋 Activity Bar Integration
- Dedicated Seraph activity panel with server icon
- Jobs TreeView with hierarchical organization:
  - Running Jobs (with live status updates)
  - Completed Jobs (recent history)
- Context menus for quick actions:
  - View Log, Cancel Job, Copy Job ID
- Toolbar buttons for Submit Job and Refresh

### 🔄 File Synchronization
- Bidirectional file sync between local workspace and server
- SFTP-based transfer with progress indicators
- Smart sync based on modification times
- Configurable exclude patterns (node_modules, .git, __pycache__, etc.)
- Status bar sync button (visible when connected)
- Three sync modes:
  - **Upload**: Local → Remote (push your changes)
  - **Download**: Remote → Local (pull server changes)  
  - **Bidirectional**: Smart sync based on modification times

### 📦 Dataset Management
- Visual dataset management dashboard
- List all ZIP datasets in `/data/$USER/datasets/`
- Extract datasets to specific GPU nodes (`/local_datasets/$USER/`)
- Track extraction status across all GPU nodes
- Progress indicators for extraction operations
- One-click dataset deletion with confirmation
- Real-time status checking

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Compile TypeScript: `npm run compile`
4. Open in VSCode and press F5 to launch the extension in a new Extension Development Host window

## 🚀 완전 초보자 가이드

### 📁 Step 1: 새 프로젝트 폴더 만들기
```bash
# 1. 바탕화면에 새 폴더 생성
mkdir ~/Desktop/my-gpu-project
cd ~/Desktop/my-gpu-project

# 2. VSCode에서 폴더 열기
code .
```

### ⚙️ Step 2: Extension 설치 및 연결 설정
1. **Seraph Manager Extension 설치**
   - VSCode Extensions 탭에서 "Seraph Manager" 검색 후 설치
   
2. **서버 연결 설정**
   - `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`) → `Seraph: Configure Connection`
   - 필수 정보 입력:
     ```
     Host: aurora.khu.ac.kr
     Port: 30080
     Username: 여러분의아이디
     Remote Path: /data/여러분의아이디/repos
     Private Key Path: (비워두기 - 패스워드 사용)
     ```

### 🔗 Step 3: 서버에 연결하기
1. **대시보드 열기**
   - `Ctrl+Shift+P` → `Seraph: Open Dashboard`
   - 또는 상태바의 "Connect" 버튼 클릭
   
2. **비밀번호 입력**
   - 서버 비밀번호 입력
   - 연결 성공하면 상태바가 🟢 초록색으로 변경

### 📂 Step 4: 코드와 데이터 업로드
1. **로컬에 파이썬 코드 작성**
   ```python
   # train.py 예시
   import torch
   print("Hello GPU Server!")
   print(f"CUDA available: {torch.cuda.is_available()}")
   ```

2. **파일 동기화**
   - 대시보드 → **File Sync 탭**
   - **📤 Upload (Local → Remote)** 클릭
   - 진행률 확인 후 완료 대기

### 🗂️ Step 5: 데이터셋 관리 (옵션)
1. **데이터셋 확인**
   - 대시보드 → **Datasets 탭**
   - `/data/username/datasets/` 폴더의 ZIP 파일들 확인

2. **GPU 노드에 압축 해제**
   - 사용할 데이터셋 선택
   - GPU 노드 선택 (예: aurora-g1)
   - **Extract** 버튼 클릭
   - 진행률 확인 후 완료 대기

### 🚀 Step 6: GPU Job 제출하기
1. **대시보드에서 Job 생성**
   - **Jobs 탭** → **➕ New Job** 클릭
   
2. **폼 작성** (웹 브라우저처럼 쉽게!)
   ```
   Job Name: my-first-job
   Python Script Path: /data/여러분의아이디/repos/train.py
   GPU Count: 1 GPU (드롭다운에서 선택)
   GPU Node: Auto-select (또는 특정 노드 선택)
   CPU Cores per GPU: 8 cores
   Memory per GPU: 32 GB
   Queue: Batch (Normal)
   Time Limit: 1-00:00:00 (1일)
   Conda Environment: (비워두기 또는 환경 이름)
   ```

3. **🚀 Submit Job** 버튼 클릭

### 📊 Step 7: Job 모니터링
1. **실시간 상태 확인**
   - Jobs 탭에서 실행 중인 Job 확인
   - 🟢 Running, 🟡 Pending, ✅ Completed 상태 표시

2. **로그 확인**
   - Job 옆의 **📋 Log** 버튼 클릭
   - 실시간 로그 스트리밍 확인
   - 에러나 진행상황 모니터링

3. **Job 취소** (필요시)
   - **❌ Cancel** 버튼으로 Job 중단 가능

### 📥 Step 8: 결과 다운로드
1. **결과 파일 동기화**
   - Job 완료 후 File Sync 탭
   - **📥 Download (Remote → Local)** 클릭
   - 서버의 결과 파일들 로컬로 다운로드

2. **로그 파일 저장**
   - Log 뷰어에서 **Download** 버튼
   - `.out`, `.err` 파일들 저장

## 💡 자주 사용하는 패턴

### 🔄 일반적인 작업 흐름
```
1. 로컬에서 코드 작성/수정
2. File Sync → Upload로 서버에 업로드
3. Jobs → New Job으로 GPU 작업 제출
4. Jobs 탭에서 실시간 모니터링
5. 완료 후 File Sync → Download로 결과 다운로드
```

### 🎯 팁과 요령
- **GPU 선택**: GPU Monitor 탭에서 사용률 낮은 노드 확인 후 선택
- **큐 선택**: 
  - `Debug` - 빠른 테스트 (시간 제한 있음)
  - `Batch` - 일반적인 학습
  - `GPU` - 높은 우선순위
- **시간 제한**: 너무 짧으면 중간에 종료, 너무 길면 대기시간 증가
- **자동 새로고침**: GPU Monitor에서 Auto Refresh 켜두면 실시간 모니터링

### ⚠️ 주의사항
- **연결 유지**: VSCode 종료하면 연결 끊어짐
- **파일 경로**: 반드시 `/data/username/` 으로 시작하는 절대 경로 사용
- **리소스 사용**: 필요한 만큼만 GPU/메모리 할당
- **정리**: 사용하지 않는 Job은 Cancel로 정리

---

## Advanced Usage

### 🔧 SSH Key 설정 (패스워드 입력 생략)
```bash
# 1. 로컬에서 SSH 키 생성
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# 2. 공개키 서버에 복사
ssh-copy-id -p 30080 username@aurora.khu.ac.kr

# 3. Extension 설정에서 Private Key Path 설정
# ~/.ssh/id_rsa (기본 경로)
```

### 📦 Conda 환경 사용
```bash
# 서버에서 환경 생성 (SSH로 직접 접속)
conda create -n pytorch-env python=3.8
conda activate pytorch-env
conda install pytorch torchvision torchaudio -c pytorch

# Job 제출시 Conda Environment 필드에 'pytorch-env' 입력
```

## Commands

| Command | Description |
|---------|-------------|
| `Seraph: Open Dashboard` | **🎯 메인 통합 대시보드 열기 (추천!)** |
| `Seraph: Configure Connection` | SSH 연결 설정 |
| `Seraph: Toggle Connection` | 서버 연결/해제 |
| `Seraph: Show GPU Dashboard` | GPU 모니터링 대시보드 (레거시) |
| `Seraph: Submit Job` | 새 Slurm 작업 제출 |
| `Seraph: Refresh Jobs` | TreeView에서 작업 상태 새로고침 |
| `Seraph: View Log` | 작업 로그 뷰어 열기 (컨텍스트 메뉴) |
| `Seraph: Cancel Job` | 실행 중인 작업 취소 (컨텍스트 메뉴) |
| `Seraph: Copy Job ID` | 작업 ID 클립보드에 복사 |
| `Seraph: Sync Files` | 파일 동기화 방향 선택 메뉴 |
| `Seraph: Sync Local → Remote` | 로컬 파일을 서버로 업로드 |
| `Seraph: Sync Remote → Local` | 서버 파일을 로컬로 다운로드 |
| `Seraph: Sync Both Ways` | 양방향 스마트 동기화 |
| `Seraph: Manage Datasets` | 데이터셋 관리 대시보드 |

## Settings

The extension stores settings in your workspace configuration:

```json
{
  "seraph.host": "aurora.khu.ac.kr",
  "seraph.port": 30080,
  "seraph.username": "your-username",
  "seraph.remotePath": "/data/your-username/repos",
  "seraph.privateKeyPath": "/path/to/your/private/key",
  "seraph.autoReconnect": true,
  "seraph.selectedGPU": "aurora-g1"
}
```
<img width="1421" height="1068" alt="스크린샷 2025-09-30 오전 10 02 12" src="https://github.com/user-attachments/assets/76c640b8-8245-4fd2-992b-83f0a8cfcc99" />

## GPU Dashboard Features

- **Node Cards**: Each GPU node displayed as an interactive card
- **GPU Status Bar**: Visual representation of GPU availability
  - 🟢 Green slots: Available GPUs
  - 🔴 Red slots: GPUs in use
- **Resource Metrics**: CPU and memory usage bars
- **Node Selection**: Click cards to select nodes for job submission
- **Real-time Updates**: Manual refresh or auto-refresh every 30 seconds

<img width="1421" height="1068" alt="스크린샷 2025-09-30 오전 10 02 04" src="https://github.com/user-attachments/assets/a6bd6e14-8ca3-4af1-b8ad-727cc5c5a1c2" />

## Job Management Features

- **Interactive Job Submission**: Guided UI for configuring Slurm jobs
  - Job name, GPU count (1-8), CPU/memory per GPU
  - Partition selection (debug_ugrad, batch_ugrad, etc.)
  - Time limits and resource allocation
  - Automatic integration with selected GPU nodes
- **Script Generation**: Automatic creation of properly formatted script.sh files
  - Complete SBATCH headers with all parameters
  - Environment activation templates
  - Error and output file configuration
- **Real-time Monitoring**: Live job status updates in Activity Bar
  - Running jobs with status indicators
  - Completed job history
  - Color-coded icons (🟢 Running, 🟡 Pending, 🔴 Failed, ✅ Completed)
- **Log Viewer**: Comprehensive log viewing capabilities
  - Real-time log streaming with Follow mode
  - Syntax highlighting for errors and warnings
  - Download logs for offline analysis
  - Multiple concurrent log viewers

## Architecture

The extension is built with a modular architecture:

- `extension.ts` - Main extension entry point and command registration
- `sshManager.ts` - SSH connection management and command execution
- `statusBarManager.ts` - Status bar integration and visual feedback
- `gpuManager.ts` - GPU status monitoring and slurm-gres-viz parsing
- `gpuDashboard.ts` - WebView-based GPU dashboard UI
- `jobManager.ts` - Slurm job submission and monitoring
- `jobTreeProvider.ts` - TreeView provider for job hierarchy
- `jobLogViewer.ts` - Real-time log viewing with WebView

## Development

### Prerequisites
- Node.js 16.x or higher
- VSCode 1.74.0 or higher

### Building
```bash
npm install
npm run compile
```

### Debugging
1. Open the project in VSCode
2. Press F5 to launch Extension Development Host
3. Use the extension in the new window

### Testing
```bash
npm test  # (when tests are implemented)
```

## Troubleshooting

### Connection Issues
- Verify host, port, and credentials are correct
- Check if the server is accessible from your network
- Ensure SSH key permissions are correct (600)
- Try connecting manually via SSH first

### GPU Status Not Loading
- Ensure `slurm-gres-viz` command is available on the server
- Check if your user has permissions to run Slurm commands
- Verify you're connected to the server first

### WebView Not Loading
- Try closing and reopening the dashboard
- Check the Developer Console (Help → Toggle Developer Tools)

## Roadmap

### ✅ Phase 1: Basic Structure & SSH Connection (Completed)
- [x] Extension structure with TypeScript
- [x] SSH connection management with configuration UI
- [x] Status bar integration with connection status

### ✅ Phase 2: GPU Monitoring Dashboard (Completed)
- [x] GPU status monitoring with slurm-gres-viz integration
- [x] Interactive WebView dashboard with real-time updates
- [x] GPU node selection for job submission

### ✅ Phase 3: Job Management (Completed)
- [x] Submit Slurm jobs through interactive GUI
- [x] Monitor running jobs in Activity Bar TreeView
- [x] Real-time log viewing with syntax highlighting
- [x] Job cancellation and management with context menus
- [x] Job ID copying and status tracking

### ✅ Phase 4: File Synchronization (Completed)
- [x] Local ↔ Remote file sync with SFTP
- [x] Progress indicators and notifications  
- [x] Selective sync with configurable exclusions
- [x] Status bar sync button integration
- [x] Smart bidirectional sync based on modification times

### ✅ Phase 4b: Dataset Management (Completed)
- [x] Visual dataset management dashboard
- [x] Dataset extraction to GPU nodes with progress tracking
- [x] Multi-node extraction status monitoring
- [x] Dataset deletion with confirmation

### Phase 5: Environment Management (Next)
- [ ] Conda environment management
- [ ] PyTorch quick installation
- [ ] Script templates and snippets
- [ ] Job history tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please create an issue on the GitHub repository.
