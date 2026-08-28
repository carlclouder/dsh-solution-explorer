/** Order of the announcement section within the tool-guidance band. */
export const SECTION_ORDER = 210

/** Model-facing announcement. */
export const EXPLORER_GUIDANCE = '本机已安装 dsh-solution-explorer 插件（DSH Web GUI 的右侧源代码管理面板）：项目会话打开时，聊天区右侧出现文件浏览器与源代码管理面板。能力：文件树浏览当前工作区目录（显示 git 状态标记 M/A/D/U/R），点击文件在编辑标签中查看与编辑内容（支持保存，Ctrl+S 或保存按钮），按文件名搜索；源代码管理面板显示暂存/未暂存/未跟踪变更清单，支持暂存/取消暂存/放弃变更，提交，查看差异与图形化提交历史（可查看提交详情/Checkout），支持仓库同步（抓取/拉取/推送/同步）、分支管理（切换/新建/重命名/删除/合并/发布）、远程仓库管理（添加/删除/修改地址）、非 git 目录初始化、合并冲突检测。设置侧边栏的「资源管理器」页可调整插件个性化设置（面板宽度、自动打开、过滤模式）。内置多标签终端：折叠窄条（rail）中的终端图标可展开底部终端面板（DSH 原生 ConPTY，默认 pwsh/cmd），关闭标签或断线自动清理进程；用户提到终端时可用它执行命令。数据源为当前会话工作目录的真实文件系统与 git 仓库，宿主进程经 /solution-explorer/* 路由提供。用户提到「右侧面板 / 文件浏览器 / 源代码管理 / 文件树 / 资源管理器 / 变更面板」时即指本插件，请据此协作。'
