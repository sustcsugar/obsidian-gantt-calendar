import { Setting, SettingGroup, Notice, requestUrl } from 'obsidian';
import { showConfirmDialog } from '../../modals/ConfirmModal';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { FeishuOAuth } from '../../data-layer/sources/api/providers/feishu/FeishuOAuth';
import { FeishuHttpClient } from '../../data-layer/sources/api/providers/feishu/FeishuHttpClient';
import { FeishuUserApi } from '../../data-layer/sources/api/providers/feishu/FeishuUserApi';
import { FeishuTaskApi } from '../../data-layer/sources/api/providers/feishu/FeishuTaskApi';
import type { FeishuTaskList } from '../../data-layer/sources/api/providers/feishu/FeishuTypes';
import { FeishuProvider, ConfigUpdateData } from '../../data-layer/sources/api/providers/FeishuProvider';
import { FeishuTaskSync } from '../../data-layer/feishu-sync/FeishuTaskSync';
import { SyncStateManager } from '../../data-layer/feishu-sync/syncState';
import { Logger } from '../../utils/logger';
import { FileSuggest } from '../components';
import { PushFilterConfig, DEFAULT_PUSH_FILTER } from '../../utils/taskFilter';
import { showSyncResultModal } from '../../modals/SyncResultModal';
import { syncFeishuTasks } from '../../commands/feishuCommands';
import { BLOCKS, bem } from '../../utils/bem';

/**
 * 同步设置构建器
 * 提供飞书任务同步的配置界面
 */
export class SyncSettingsBuilder extends BaseBuilder {
	// 临时存储待处理的授权码
	private pendingAuthCode: string = '';

	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		const syncConfig = this.getSyncConfiguration();

		// 免责声明横幅（最顶部）
		this.renderSyncWarningBanner();

		// ===== 分组 1：飞书任务同步 =====
		this.createSettingGroup('飞书任务同步', (group) => {
			const container = group instanceof HTMLElement ? group : this.containerEl;
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(container));
				}
			};

			// 飞书账号连接
			this.renderFeishuSettings(group, syncConfig);

			// 获取任务清单按钮
			addSetting(setting =>
				setting.setName('任务清单')
					.setDesc('获取飞书账号中可操作的任务清单')
					.addButton(button => button
						.setButtonText('获取任务清单')
						.onClick(async () => {
							await this.fetchFeishuTaskLists();
						}))
			);

			// 任务清单提示和卡片
			this.renderTasklistCards(container, syncConfig);
		});

		// ===== 推送过滤 =====
		this.renderPushFilter();

		// ===== 分组 2：同步配置 =====
		this.createSettingGroup('同步配置', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 飞书同步目标文件
			addSetting(setting =>
				setting.setName('飞书同步目标文件')
					.setDesc('飞书新任务将同步到此文件（不存在时自动创建）')
					.addSearch(cb => {
						new FileSuggest(this.plugin.app, cb.inputEl);
						cb.setPlaceholder('gantt-calendar-feishu-sync.md')
							.setValue(syncConfig.feishuSyncTargetFile || 'gantt-calendar-feishu-sync.md')
							.onChange(async (value: string) => {
								this.updateSyncConfig({ feishuSyncTargetFile: value || 'gantt-calendar-feishu-sync.md' });
								await this.saveAndRefreshViews();
							});
					})
			);

			// 同步方向
			addSetting(setting =>
				setting.setName('同步方向')
					.setDesc('选择任务同步的方向')
					.addDropdown(drop => drop
						.addOptions({
							'bidirectional': '双向同步',
							'import-only': '仅导入（从飞书）',
							'export-only': '仅导出（到飞书）'
						})
						.setValue(syncConfig.syncDirection)
						.onChange(async (value) => {
							this.updateSyncConfig({ syncDirection: value as 'bidirectional' | 'import-only' | 'export-only' });
							await this.saveAndRefreshViews();
						}))
			);

			// 冲突解决策略
			addSetting(setting =>
				setting.setName('冲突解决策略')
					.setDesc('当本地和飞书任务同时修改时的处理方式')
					.addDropdown(drop => drop
						.addOptions({
							'local-win': '本地优先',
							'remote-win': '飞书优先',
							'newest-win': '最新修改优先',
						})
						.setValue(syncConfig.conflictResolution)
						.onChange(async (value) => {
							this.updateSyncConfig({ conflictResolution: value as 'local-win' | 'remote-win' | 'newest-win' });
							await this.saveAndRefreshViews();
						}))
			);

			// 自动同步间隔
			addSetting(setting =>
				setting.setName('自动同步间隔')
					.setDesc('自动同步的时间间隔（分钟），设为 0 关闭自动同步')
					.addSlider(slider => slider
						.setLimits(0, 120, 5)
						.setValue(syncConfig.syncInterval)
						.setDynamicTooltip()
						.onChange(async (value: number) => {
							this.updateSyncConfig({ syncInterval: value });
							await this.saveAndRefreshViews();
						}))
			);

			// 操作按钮
			addSetting(setting =>
				setting.setName('手动同步')
					.setDesc('立即执行一次同步操作。「测试同步」仅同步截止时间最新的 5 条真实任务，用于调试。')
					.addButton(button => button
						.setButtonText('立即同步')
						.setClass('mod-cta')
						.setDisabled(!syncConfig.api?.tasklistGuid)
						.onClick(async () => {
							const confirmed = await showConfirmDialog(
								this.plugin.app,
								'立即同步',
								'即将执行全量双向同步：\n\n' +
								'• Obsidian → 飞书：推送所有未同步的本地任务\n' +
								'• 飞书 → Obsidian：拉取所有未同步的远程任务\n' +
								'• 已同步的任务将根据变更情况进行更新\n' +
								'• 冲突任务将按照当前冲突策略处理\n\n' +
								'请确保已正确配置同步参数。',
								{ confirmText: '开始同步', cancelText: '取消' }
							);
							if (!confirmed) return;
							await this.runManualSync();
						}))
					.addButton(button => button
						.setButtonText('测试同步')
						.setTooltip('双向同步截止时间最新的 5 条真实任务，用于调试')
						.setDisabled(!syncConfig.api?.tasklistGuid)
						.onClick(async () => {
							const confirmed = await showConfirmDialog(
								this.plugin.app,
								'测试同步',
								'即将执行测试同步（限 5 条任务）：\n\n' +
								'• 仅同步截止时间最新的 5 条真实任务\n' +
								'• 双向同步：Obsidian ↔ 飞书\n' +
								'• 不会影响已同步的任务\n\n' +
								'确定继续？',
								{ confirmText: '开始测试', cancelText: '取消' }
							);
							if (!confirmed) return;
							await this.runTestSync();
						}))
			);
		});
	}

	// ==================== 免责声明横幅 ====================

	private renderSyncWarningBanner(): void {
		const banner = this.containerEl.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING));

		const iconWrap = banner.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'icon'));
		iconWrap.setText('⚠️');

		const body = banner.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'body'));

		const title = body.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'title'));
		title.setText('同步功能正在开发完善中');

		const desc = body.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'desc'));
		const line1 = desc.createDiv();
		line1.setText('该功能可能存在未知的稳定性问题，使用前请务必备份您的笔记库，以免造成数据丢失。');

		const line2 = desc.createDiv();
		const strong = line2.createEl('strong');
		strong.setText('数据无价，备份为先。');
	}

	// ==================== 任务清单卡片 ====================

	/**
	 * 渲染任务清单卡片列表（收入分组内）
	 */
	private renderTasklistCards(container: HTMLElement, syncConfig: any): void {
		const taskLists = syncConfig.api?.taskLists as FeishuTaskList[] || [];
		const selectedGuid = syncConfig.api?.tasklistGuid || '';

		// 未获取清单时的提示
		if (taskLists.length === 0) {
			const hintEl = container.createDiv('gc-sync-hint');
			hintEl.setText('↑ 请先点击上方「获取任务清单」按钮获取清单列表，然后选择同步目标清单。');
			return;
		}

		// 清单选择状态提示
		if (!selectedGuid) {
			const hintEl = container.createDiv('gc-sync-hint gc-sync-hint--warning');
			hintEl.setText('⚠ 未选择任务清单，无法执行任务同步功能。请在下方选择一个任务清单作为同步目标。');
		} else {
			const selectedList = taskLists.find((tl: FeishuTaskList) => tl.guid === selectedGuid);
			const hintEl = container.createDiv('gc-sync-hint gc-sync-hint--success');
			const listName = selectedList?.name || selectedGuid;
			const prefix = hintEl.createSpan();
			prefix.setText('✓ 已选择任务清单，可以执行任务同步功能。选择任务清单「');
			const nameSpan = hintEl.createSpan('gc-sync-hint__list-name');
			nameSpan.setText(listName);
			const suffix = hintEl.createSpan();
			suffix.setText('」作为同步目标。');
		}

		// 清单卡片列表
		const taskListEl = container.createDiv('gc-sync-tasklist');

		const headerEl = taskListEl.createDiv('gc-sync-tasklist__header');
		headerEl.textContent = '飞书任务清单列表 (' + taskLists.length + ' 个)';

		const listEl = taskListEl.createDiv('gc-sync-tasklist__grid');

		taskLists.forEach((tl) => {
			const isSelected = tl.guid === selectedGuid;
			const itemEl = listEl.createDiv('gc-sync-tasklist-card');
			if (isSelected) {
				itemEl.addClass('gc-sync-tasklist-card--selected');
			}

			// 标题
			const titleDiv = itemEl.createDiv('gc-sync-tasklist-card__name');
			titleDiv.setText((isSelected ? '✓ ' : '') + tl.name);

			// GUID
			const idDiv = itemEl.createDiv('gc-sync-tasklist-card__guid');
			idDiv.setText(tl.guid);

			// 创建者
			if (tl.creator) {
				const creatorDiv = itemEl.createDiv('gc-sync-tasklist-card__meta');
				creatorDiv.setText('创建者: ' + tl.creator.id);
			}

			// 成员数
			if (tl.members && tl.members.length > 0) {
				const memberDiv = itemEl.createDiv('gc-sync-tasklist-card__meta');
				memberDiv.setText('成员: ' + tl.members.length + ' 人');
			}

			// 按钮行
			const btnRow = itemEl.createDiv('gc-sync-tasklist-card__actions');

			// 选择/取消选择按钮
			const selectBtn = btnRow.createEl('button');
			if (isSelected) {
				selectBtn.textContent = '取消选择';
				selectBtn.onclick = async () => {
					if (!syncConfig.api) syncConfig.api = {} as any;
					syncConfig.api.tasklistGuid = '';
					await this.saveAndRefreshAll();
					new Notice('已取消任务清单选择，同步功能已暂停。');
				};
			} else {
				selectBtn.textContent = '选择';
				selectBtn.onclick = async () => {
					const switching = !!selectedGuid;
					if (switching) {
							const confirmed = await showConfirmDialog(
								this.plugin.app,
								'切换任务清单',
								'⚠️ 切换任务清单将触发全量同步\n\n' +
								'为方便管理，Obsidian 中的任务仅会同步到当前选中的目标清单中，\n' +
								'不会与飞书中其他清单的任务混淆。\n\n' +
								'确定切换到清单「' + tl.name + '」吗？',
								{ confirmText: '切换', cancelText: '取消' }
							);
						if (!confirmed) return;
					}
					if (!syncConfig.api) syncConfig.api = {} as any;
					syncConfig.api.tasklistGuid = tl.guid;
					await this.saveAndRefreshAll();
					new Notice('已切换任务清单：' + tl.name + (switching ? '（将执行全量同步）' : ''));
				};
			}

			// 测试写入
			const testBtn = btnRow.createEl('button');
			testBtn.textContent = '测试写入';
			testBtn.title = '向该清单写入 5 条虚拟任务，仅验证 API 连通性';
			testBtn.onclick = async () => {
				await this.testSyncToTasklist(tl.guid, tl.name);
			};

			// 清除任务
			const clearBtn = btnRow.createEl('button');
			clearBtn.textContent = '清除任务';
			clearBtn.title = '删除该清单中的所有飞书任务（不可恢复）';
			clearBtn.className = 'mod-warning';
			clearBtn.onclick = async () => {
					const confirmed = await showConfirmDialog(
						this.plugin.app,
						'清除任务',
						'确定要清除清单「' + tl.name + '」中的所有任务吗？\n\n此操作将删除该清单下的所有飞书任务，不可恢复！',
						{ confirmText: '清除', cancelText: '取消', isDestructive: true }
					);
				if (!confirmed) return;
				await this.clearFeishuTasklistTasks(tl.guid, tl.name);
			};
		});
	}

	// ==================== 飞书账号设置 ====================

	private renderFeishuSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		const isConnected = !!(syncConfig.api?.accessToken);

		// 连接状态 + 授权按钮
		addSetting(setting =>
			setting.setName('飞书账号')
				.setDesc(isConnected ? '已连接' : '未连接')
				.addButton(button => button
					.setButtonText(isConnected ? '重新授权' : '连接飞书账号')
					.setClass('mod-cta')
					.onClick(() => {
						this.initiateFeishuOAuth(syncConfig);
					}))
		);

		// App ID
		addSetting(setting =>
			setting.setName('App ID')
				.setDesc('飞书开放平台应用的 App ID')
				.addText(text => text
					.setPlaceholder('cli_xxxxxxxxxxxxx')
					.setValue(syncConfig.api?.clientId || syncConfig.api?.appId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, clientId: value, appId: value }
						});
						await this.saveAndRefreshViews();
					}))
		);

		// App Secret
		addSetting(setting =>
			setting.setName('App Secret')
				.setDesc('飞书开放平台应用的 App Secret，用于刷新令牌')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxxxxxxxx')
					.setValue(syncConfig.api?.clientSecret || syncConfig.api?.appSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, clientSecret: value, appSecret: value }
						});
						await this.saveAndRefreshViews();
					}))
				.then(setting => {
					const inputEl = setting.controlEl.querySelector('input');
					if (inputEl) {
						inputEl.type = 'password';
					}
				})
		);

		// 重定向 URL
		addSetting(setting =>
			setting.setName('重定向 URL')
				.setDesc('OAuth 授权完成后的回调地址')
				.addText(text => text
					.setPlaceholder('https://open.feishu.cn/api-explorer/loading')
					.setValue(syncConfig.api?.redirectUri || FeishuOAuth.getDefaultRedirectUri())
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, redirectUri: value }
						});
						await this.saveAndRefreshViews();
					}))
		);

		// 授权码输入框
		addSetting(setting =>
			setting.setName('授权码')
				.setDesc('从浏览器回调 URL 中复制 code 参数值并粘贴，然后点击获取令牌')
				.addText(text => text
					.setPlaceholder('粘贴授权码...')
					.onChange((value: string) => {
						this.pendingAuthCode = value.trim();
					}))
				.addButton(button => button
					.setButtonText('获取令牌')
					.setClass('mod-cta')
					.onClick(async () => {
						if (!this.pendingAuthCode || this.pendingAuthCode.length < 10) {
							new Notice('请先输入有效的授权码');
							return;
						}
						await this.exchangeFeishuAuthCode(syncConfig, this.pendingAuthCode);
						this.pendingAuthCode = '';
						const nameEl = setting.nameEl;
						const inputEl = nameEl?.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.value = '';
						}
					}))
		);

		// 已授权信息
		if (isConnected && syncConfig.api?.accessToken) {
			if (syncConfig.api?.userName || syncConfig.api?.userId) {
				addSetting(setting =>
					setting.setName('已授权用户')
						.setDesc(syncConfig.api.userName ? `${syncConfig.api.userName} (${syncConfig.api.userId || 'Unknown'})` : syncConfig.api.userId || 'Unknown')
						.addExtraButton(button => button
							.setIcon('user')
							.setTooltip('测试连接，获取用户信息')
							.onClick(() => this.testFeishuConnection(syncConfig)))
				);
			}

			// Access Token（部分隐藏）
			addSetting(setting =>
				setting.setName('Access Token')
					.setDesc('请注意保密，不要分享给他人')
					.addText(text => text
						.setValue(this.maskToken(syncConfig.api.accessToken))
						.setDisabled(true))
					.addExtraButton(button => button
						.setIcon('copy')
						.setTooltip('复制完整 Token')
						.onClick(() => {
							navigator.clipboard.writeText(syncConfig.api.accessToken);
							new Notice('已复制到剪贴板');
						}))
			);

			// 令牌过期时间
			if (syncConfig.api?.tokenExpireAt) {
				const expireTime = new Date(syncConfig.api.tokenExpireAt);
				const isExpired = Date.now() > syncConfig.api.tokenExpireAt;
				const remainingText = FeishuOAuth.formatExpireTime(syncConfig.api.tokenExpireAt);

				addSetting(setting =>
					setting.setName('令牌状态')
						.setDesc(isExpired ? '令牌已过期，请重新授权' : `过期时间: ${expireTime.toLocaleString()} (${remainingText})`)
						.addExtraButton(button => button
							.setIcon(isExpired ? 'alert-triangle' : 'check-circle')
							.setTooltip(isExpired ? '已过期' : '有效'))
						.addButton(btn => btn
							.setButtonText('刷新')
							.setTooltip(isExpired ? '重新授权' : '尝试刷新令牌')
							.onClick(() => isExpired ? this.initiateFeishuOAuth(syncConfig) : this.refreshFeishuToken(syncConfig)))
				);
			}
		}

		
			// Refresh 令牌状态
			if (syncConfig.api?.refreshToken) {
				addSetting(setting => {
					const hasExpireAt = !!syncConfig.api?.refreshTokenExpireAt;
					const isExpired = hasExpireAt && Date.now() > syncConfig.api.refreshTokenExpireAt;
					const desc = hasExpireAt
						? (isExpired
							? 'Refresh 令牌已过期，请重新授权'
							: `过期时间: ${new Date(syncConfig.api.refreshTokenExpireAt).toLocaleString()} (${FeishuOAuth.formatExpireTime(syncConfig.api.refreshTokenExpireAt)})`)
						: '过期时间未知（重新授权后可显示）';
					setting.setName('Refresh 令牌状态')
						.setDesc(desc)
						.addExtraButton(button => button
							.setIcon(isExpired ? 'alert-triangle' : (hasExpireAt ? 'check-circle' : 'info'))
							.setTooltip(isExpired ? '已过期' : (hasExpireAt ? '有效' : '时间未知')));
				});
			}
			// 取消授权
		if (isConnected) {
			addSetting(setting =>
				setting.setName('取消授权')
					.setDesc('清除已保存的飞书授权信息')
					.addButton(button => button
						.setButtonText('取消授权')
						.setWarning()
						.onClick(async () => {
							this.updateSyncConfig({
								api: {
									...syncConfig.api,
									accessToken: undefined,
									refreshToken: undefined,
									tokenExpireAt: undefined,
									userId: undefined,
									userName: undefined,
								}
							});
							await this.saveAndRefreshViews();
							await this.saveAndRefreshAll();
							new Notice('已取消飞书授权');
						}))
			);
		}
	}

	// ==================== OAuth 流程 ====================

	private initiateFeishuOAuth(_syncConfig: any): void {
		const currentSyncConfig = this.getSyncConfiguration();
		const apiConfig = currentSyncConfig.api;
		const clientId = apiConfig?.clientId || apiConfig?.appId;

		if (!clientId) {
			new Notice('请先配置 App ID');
			return;
		}

		const authUrl = FeishuOAuth.getAuthUrl({
			clientId: clientId,
			clientSecret: apiConfig?.clientSecret || apiConfig?.appSecret || '',
			redirectUri: apiConfig?.redirectUri || FeishuOAuth.getDefaultRedirectUri(),
		});

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成飞书授权，然后从回调 URL 中复制授权码');
	}

	private async exchangeFeishuAuthCode(_syncConfig: any, code: string): Promise<void> {
		try {
			new Notice('正在交换授权码...');

			const currentSyncConfig = this.getSyncConfiguration();
			const apiConfig = currentSyncConfig.api;

			const clientId = apiConfig?.clientId || apiConfig?.appId || '';
			const clientSecret = apiConfig?.clientSecret || apiConfig?.appSecret || '';

			if (!clientId) {
				new Notice('请先配置 App ID 和 App Secret');
				return;
			}

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tokenResponse = await FeishuOAuth.exchangeCodeForToken({
				clientId,
				clientSecret,
			}, code, requestFetch);

			if (!tokenResponse.access_token) {
				throw new Error('飞书 API 响应格式错误：缺少 access_token');
			}

			const expiresIn = tokenResponse.expires_in || 7200;
			const tokenExpireAt = Date.now() + expiresIn * 1000;

			const updateData: any = {
				...apiConfig,
				accessToken: tokenResponse.access_token,
				refreshToken: tokenResponse.refresh_token,
				tokenExpireAt: tokenExpireAt,
				refreshTokenExpireAt: tokenResponse.refresh_token_expires_in
					? Date.now() + tokenResponse.refresh_token_expires_in * 1000
					: undefined,
			};

			try {
				const userInfo = await FeishuUserApi.getUserInfo(tokenResponse.access_token, requestFetch);
				if (userInfo) {
					updateData.userId = userInfo.userId;
					updateData.userOpenId = userInfo.openId;
					updateData.userName = userInfo.name;
				}
			} catch (e) {
				Logger.warn('SyncSettingsBuilder', '获取用户信息失败（非致命）', e);
			}

			this.updateSyncConfig({ api: updateData });
			await this.saveAndRefreshViews();
			new Notice('飞书授权成功！');
			await this.saveAndRefreshAll();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Authorization failed', error);
			if (errorMsg.includes('过期') || errorMsg.includes('invalid_grant')) {
				new Notice('授权码已过期，请重新点击授权按钮（授权码有效期约 5 分钟）', 8000);
			} else {
				new Notice('授权失败: ' + errorMsg, 8000);
			}
		}
	}

	private async refreshFeishuToken(_syncConfig: any): Promise<void> {
		try {
			new Notice('正在刷新令牌...');

			const currentSyncConfig = this.getSyncConfiguration();
			const apiConfig = currentSyncConfig.api;

			const clientId = apiConfig?.clientId || apiConfig?.appId || '';
			const clientSecret = apiConfig?.clientSecret || apiConfig?.appSecret || '';
			const refreshToken = apiConfig?.refreshToken;

			if (!clientId) {
				new Notice('请先配置 App ID');
				return;
			}

			if (!refreshToken) {
				new Notice('没有可用的刷新令牌，请重新授权');
				return;
			}

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tokenResponse = await FeishuOAuth.refreshAccessToken({
				clientId,
				clientSecret,
				refreshToken,
			}, requestFetch);

			if (!tokenResponse.access_token) {
				throw new Error('飞书 API 响应格式错误：缺少 access_token');
			}

			const expiresIn = tokenResponse.expires_in || 7200;
			const tokenExpireAt = Date.now() + expiresIn * 1000;

			this.updateSyncConfig({
				api: {
					...apiConfig,
					accessToken: tokenResponse.access_token,
					refreshToken: tokenResponse.refresh_token || refreshToken,
					tokenExpireAt: tokenExpireAt,
					refreshTokenExpireAt: tokenResponse.refresh_token_expires_in
						? Date.now() + tokenResponse.refresh_token_expires_in * 1000
						: apiConfig.refreshTokenExpireAt,
				}
			});

			await this.saveAndRefreshViews();
			new Notice('令牌刷新成功！');
			await this.saveAndRefreshAll();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice('刷新失败: ' + errorMsg + '，请重新授权');
		}
	}

	private maskToken(token: string): string {
		if (!token || token.length < 20) {
			return token;
		}
		const prefix = token.substring(0, 8);
		const suffix = token.substring(token.length - 4);
		const maskedLength = Math.min(token.length - 12, 20);
		return `${prefix}${'*'.repeat(maskedLength)}${suffix}`;
	}

	// ==================== 连接测试 ====================

	private async testFeishuConnection(syncConfig: any): Promise<void> {
		const apiConfig = syncConfig.api;

		if (!apiConfig?.accessToken) {
			new Notice('未授权：请先完成飞书授权');
			return;
		}

		const isExpired = apiConfig.tokenExpireAt && Date.now() > apiConfig.tokenExpireAt;
		const expireInfo = apiConfig.tokenExpireAt
			? FeishuOAuth.formatExpireTime(apiConfig.tokenExpireAt)
			: '未知';

		new Notice('正在测试飞书连接...');

		try {
			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const userInfo = await FeishuUserApi.getUserInfo(apiConfig.accessToken, requestFetch);

			const parts: string[] = [];
			parts.push('✅ 飞书连接测试成功');
			parts.push('');
			parts.push('用户信息:');
			parts.push(`  名称: ${userInfo.name}`);
			if (userInfo.enName) parts.push(`  英文名: ${userInfo.enName}`);
			parts.push(`  用户ID: ${userInfo.userId}`);
			parts.push(`  OpenID: ${userInfo.openId}`);
			if (userInfo.email) parts.push(`  邮箱: ${userInfo.email}`);

			parts.push('');
			parts.push('令牌状态:');
			parts.push(`  过期时间: ${new Date(apiConfig.tokenExpireAt).toLocaleString()}`);
			parts.push(`  状态: ${isExpired ? '已过期' : '✅ 有效 (' + expireInfo + ')'}`);

			parts.push('');
			const taskListCount = syncConfig.api?.taskLists?.length || 0;
			parts.push(`已授权清单: ${taskListCount} 个`);
			if (syncConfig.api?.tasklistGuid) {
				const selectedList = syncConfig.api?.taskLists?.find((tl: any) => tl.guid === syncConfig.api.tasklistGuid);
				if (selectedList) {
					parts.push(`当前清单: ${selectedList.name}`);
				}
			}

			new Notice(parts.join('\n'), 10000);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			const parts: string[] = [];
			parts.push('❌ 飞书连接测试失败');
			parts.push('');
			parts.push(`错误信息: ${errorMsg}`);

			const codeMatch = errorMsg.match(/错误码[：:]\s*(\d+)/) || errorMsg.match(/code[：:]\s*(\d+)/i);
			if (codeMatch) {
				parts.push(`错误码: ${codeMatch[1]}`);
			}

			parts.push('');
			parts.push('令牌状态:');
			if (apiConfig.tokenExpireAt) {
				parts.push(`  过期时间: ${new Date(apiConfig.tokenExpireAt).toLocaleString()}`);
			}
			parts.push(`  状态: ${isExpired ? '已过期' : '有效 (' + expireInfo + ')'}`);

			if (errorMsg.includes('401')) {
				parts.push('');
				parts.push('可能原因: Access Token 无效或已过期');
				parts.push('建议: 请重新授权获取新的令牌');
			} else if (errorMsg.includes('403')) {
				parts.push('');
				parts.push('可能原因: 权限不足或应用未通过审核');
				parts.push('建议: 检查应用权限配置和应用审核状态');
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				parts.push('');
				parts.push('可能原因: 网络连接问题');
				parts.push('建议: 检查网络连接或防火墙设置');
			}

			new Notice(parts.join('\n'), 12000);
			Logger.error('SyncSettingsBuilder', 'Connection test failed', error);
		}
	}



	// ==================== 推送过滤 ====================

	/**
	 * 渲染推送过滤设置
	 * 提供状态、标签、优先级、路径四个维度的组合过滤条件
	 */
	private renderPushFilter(): void {
		const syncConfig = this.getSyncConfiguration();
		const pushFilter: PushFilterConfig = syncConfig.pushFilter || DEFAULT_PUSH_FILTER;

		this.createSettingGroup('推送过滤', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 启用开关
			addSetting(setting =>
				setting.setName('启用推送过滤')
					.setDesc('开启后，仅符合条件的新任务会推送到飞书，已同步任务的任何变更仍会同步')
					.addToggle(toggle => toggle
						.setValue(pushFilter.enabled)
						.onChange(async (value: boolean) => {
							if (!syncConfig.pushFilter) {
								syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							}
							syncConfig.pushFilter.enabled = value;
							await this.saveAndRefreshViews();
						}))
			);

			// 完成状态过滤
			addSetting(setting =>
				setting.setName('完成状态过滤')
					.setDesc('选择推送哪些任务，已同步任务不受影响')
					.addDropdown(drop => drop
						.addOptions({
							'all': '全部任务',
							'incomplete-only': '仅未完成任务',
						})
						.setValue(pushFilter.completionStatus || 'all')
						.onChange(async (value: string) => {
							if (!syncConfig.pushFilter) {
								syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							}
							syncConfig.pushFilter.completionStatus = value as 'all' | 'incomplete-only';
							await this.saveAndRefreshViews();
						}))
			);

			// 日期过滤
			addSetting(setting => {
				const dateSetting = setting.setName('日期过滤')
					.setDesc('仅推送指定日期之后的任务，任务任一日期字段匹配即可')
					.addText(text => {
						text.inputEl.type = 'date';
						text.setValue(pushFilter.sinceDate || '');
						text.onChange(async (value: string) => {
							if (!syncConfig.pushFilter) { syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER }; }
							syncConfig.pushFilter.sinceDate = value;
							updateActiveBtn();
							await this.plugin.saveSettings();
						});
					});
				const dateInputEl = dateSetting.components[0] as any;
				const quickBtns: HTMLButtonElement[] = [];
				const updateActiveBtn = (activeEl?: HTMLButtonElement | null) => {
					for (const b of quickBtns) {
						if (activeEl && b === activeEl) {
							b.classList.add('mod-cta');
						} else {
							b.classList.remove('mod-cta');
						}
					}
				};
				dateSetting
					.addButton(btn => {
						btn.setButtonText('全部');
						quickBtns.push(btn.buttonEl);
						btn.onClick(async () => {
							if (!syncConfig.pushFilter) syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							syncConfig.pushFilter.sinceDate = '';
							if (dateInputEl?.inputEl) dateInputEl.inputEl.value = '';
							updateActiveBtn(btn.buttonEl);
							await this.plugin.saveSettings();
						});
					})
					.addButton(btn => {
						btn.setButtonText('近一周');
						quickBtns.push(btn.buttonEl);
						btn.onClick(async () => {
							if (!syncConfig.pushFilter) syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							const d = new Date(); d.setDate(d.getDate() - 7);
							syncConfig.pushFilter.sinceDate = d.toISOString().slice(0, 10);
							if (dateInputEl?.inputEl) dateInputEl.inputEl.value = d.toISOString().slice(0, 10);
							updateActiveBtn(btn.buttonEl);
							await this.plugin.saveSettings();
						});
					})
					.addButton(btn => {
						btn.setButtonText('近1月');
						quickBtns.push(btn.buttonEl);
						btn.onClick(async () => {
							if (!syncConfig.pushFilter) syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							const d = new Date(); d.setDate(d.getDate() - 30);
							syncConfig.pushFilter.sinceDate = d.toISOString().slice(0, 10);
							if (dateInputEl?.inputEl) dateInputEl.inputEl.value = d.toISOString().slice(0, 10);
							updateActiveBtn(btn.buttonEl);
							await this.plugin.saveSettings();
						});
					})
					.addButton(btn => {
						btn.setButtonText('近3月');
						quickBtns.push(btn.buttonEl);
						btn.onClick(async () => {
							if (!syncConfig.pushFilter) syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							const d = new Date(); d.setDate(d.getDate() - 90);
							syncConfig.pushFilter.sinceDate = d.toISOString().slice(0, 10);
							if (dateInputEl?.inputEl) dateInputEl.inputEl.value = d.toISOString().slice(0, 10);
							updateActiveBtn(btn.buttonEl);
							await this.plugin.saveSettings();
						});
					})
					.addButton(btn => {
						btn.setButtonText('近半年');
						quickBtns.push(btn.buttonEl);
						btn.onClick(async () => {
							if (!syncConfig.pushFilter) syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							const d = new Date(); d.setDate(d.getDate() - 180);
							syncConfig.pushFilter.sinceDate = d.toISOString().slice(0, 10);
							if (dateInputEl?.inputEl) dateInputEl.inputEl.value = d.toISOString().slice(0, 10);
							updateActiveBtn(btn.buttonEl);
							await this.plugin.saveSettings();
						});
					})
					.addButton(btn => {
						btn.setButtonText('近1年');
						quickBtns.push(btn.buttonEl);
						btn.onClick(async () => {
							if (!syncConfig.pushFilter) syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							const d = new Date(); d.setDate(d.getDate() - 365);
							syncConfig.pushFilter.sinceDate = d.toISOString().slice(0, 10);
							if (dateInputEl?.inputEl) dateInputEl.inputEl.value = d.toISOString().slice(0, 10);
							updateActiveBtn(btn.buttonEl);
							await this.plugin.saveSettings();
						});
					});
				// 初始状态：无日期过滤时高亮"全部"
				if (!pushFilter.sinceDate && quickBtns.length > 0) {
					quickBtns[0].classList.add('mod-cta');
				}
			});
// 路径过滤
			addSetting(setting =>
				setting.setName('路径过滤')
					.setDesc('按文件路径过滤，每行一个路径，文件夹以 / 结尾')
					.addTextArea(text => {
						text.setPlaceholder('每行一个路径，如：' + String.fromCharCode(10) + 'projects/' + String.fromCharCode(10) + 'Daily/Tasks.md')
							.setValue(pushFilter.paths.join(String.fromCharCode(10)));
						text.inputEl.rows = 3;
						text.onChange(async (value: string) => {
							if (!syncConfig.pushFilter) {
								syncConfig.pushFilter = { ...DEFAULT_PUSH_FILTER };
							}
							syncConfig.pushFilter.paths = value.split(String.fromCharCode(10)).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
							await this.saveAndRefreshViews();
						});
					})
			);
		});
	}

		private getSyncConfiguration(): any {
		if (!this.plugin.settings.syncConfiguration) {
			this.plugin.settings.syncConfiguration = {
				enabledSources: {},
				syncDirection: 'bidirectional',
				syncInterval: 30,
				conflictResolution: 'local-win',
				feishuSyncTargetFile: 'gantt-calendar-feishu-sync.md',
			};
		}
		const config = this.plugin.settings.syncConfiguration;
		if (!config.pushFilter) {
			config.pushFilter = { ...DEFAULT_PUSH_FILTER };
		}
		return config;
	}

	private updateSyncConfig(updates: any): void {
		const currentConfig = this.getSyncConfiguration();

		if (updates.api) {
			Logger.debug('SyncSettingsBuilder', 'updateSyncConfig', {
				currentApi: currentConfig.api,
				updatesApi: updates.api,
			});
		}

		this.plugin.settings.syncConfiguration = {
			...currentConfig,
			...updates,
			enabledSources: {
				...currentConfig.enabledSources,
				...(updates.enabledSources || {}),
			},
			api: updates.api !== undefined ? {
				...currentConfig.api,
				...updates.api,
			} : currentConfig.api,
		};

		if (updates.api) {
			Logger.debug('SyncSettingsBuilder', 'Merged syncConfiguration.api', this.plugin.settings.syncConfiguration?.api ?? 'undefined');
		}
	}

	// ==================== 同步操作 ====================

		private async runManualSync(): Promise<void> {
		await syncFeishuTasks(this.plugin);
	}

	private async runTestSync(): Promise<void> {
		try {
			const syncConfig = this.getSyncConfiguration();
			const apiConfig = syncConfig.api;

			if (!apiConfig?.accessToken) {
				new Notice('请先在设置中完成飞书授权');
				return;
			}

			const clientId = apiConfig.clientId || apiConfig.appId;
			const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

			if (!clientId || !clientSecret) {
				new Notice('请先配置飞书 App ID 和 App Secret');
				return;
			}

			const tasklistGuid = apiConfig.tasklistGuid;
			if (!tasklistGuid) {
				new Notice('请先选择一个飞书任务清单作为同步目标');
				return;
			}

			const controller = new AbortController();

			const provider = new FeishuProvider({
				enabled: true,
				syncDirection: syncConfig.syncDirection,
				autoSync: false,
				syncInterval: 0,
				conflictResolution: syncConfig.conflictResolution,
				api: {
					provider: 'feishu',
					accessToken: apiConfig.accessToken,
					refreshToken: apiConfig.refreshToken,
					tokenExpireAt: apiConfig.tokenExpireAt,
					clientId,
					clientSecret,
					redirectUri: apiConfig.redirectUri,
				},
		});

			provider.setConfigUpdateCallback(async (data: ConfigUpdateData) => {
				const api = syncConfig.api;
				if (api) {
					if (data.accessToken) api.accessToken = data.accessToken;
					if (data.refreshToken) api.refreshToken = data.refreshToken;
					if (data.tokenExpireAt) api.tokenExpireAt = data.tokenExpireAt;
				}
				await this.plugin.saveSettings();
			});

			try {
				await provider.validateAuth();
			} catch (authError) {
				new Notice('飞书授权已失效，请重新授权', 8000);
				return;
			}

			const stateManager = new SyncStateManager(this.plugin.app);
			const syncEngine = new FeishuTaskSync(this.plugin.app, provider, stateManager, {
				conflictStrategy: syncConfig.conflictResolution as 'newest-win' | 'local-win' | 'remote-win' || 'newest-win',
				targetFile: syncConfig.feishuSyncTargetFile || 'gantt-calendar-feishu-sync.md',
				enabledFormats: (this.plugin.settings.enabledTaskFormats as ('tasks' | 'dataview')[]) || ['tasks', 'dataview'],
				globalFilter: this.plugin.settings.globalTaskFilter,
				pushFilter: syncConfig.pushFilter as PushFilterConfig,
				tasklistGuid,
				creatorOpenId: apiConfig.userOpenId,
				creatorUserId: apiConfig.userId,
				abortSignal: controller.signal,
			});

			const result = await syncEngine.testSync(5);

			const parts: string[] = [];
			if (result.pushed > 0) parts.push('推送 ' + result.pushed + ' 个');
			if (result.pulled > 0) parts.push('拉取 ' + result.pulled + ' 个');
			const summary = parts.length > 0 ? parts.join('，') : '无变更';

			// 有详细变更记录时弹出详细结果弹窗
			if (result.details.length > 0) {
				showSyncResultModal(this.plugin.app, '测试同步完成: ' + summary, result);
			} else if (result.errors.length > 0) {
				new Notice("测试同步完成: " + summary + "\n" + result.errors.join("\n"), 10000);
			} else {
				new Notice('测试同步完成: ' + summary);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice('测试同步出错: ' + errorMsg);
		}
	}

	// ==================== 清单操作 ====================

	private async fetchFeishuTaskLists(): Promise<void> {
		new Notice('正在获取飞书任务清单...');

		try {
			const config = this.getSyncConfiguration();
			const accessToken = config.api?.accessToken;

			if (!accessToken) {
				new Notice('请先完成飞书授权');
				return;
			}

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const taskLists = await FeishuTaskApi.getAllTaskLists(accessToken, requestFetch);

			this.updateSyncConfig({
				api: {
					...config.api,
					taskLists: taskLists,
					taskListsFetchedAt: Date.now(),
				}
			});
			await this.saveAndRefreshViews();
			await this.saveAndRefreshAll();

			if (taskLists.length === 0) {
				new Notice('未找到任务清单，请先在飞书中创建至少一个任务清单，然后重新获取');
			} else {
				new Notice('成功获取 ' + taskLists.length + ' 个任务清单');
			}

			Logger.debug('SyncSettingsBuilder', 'Feishu task lists',
				taskLists.map((tl, index) => ({
					index: index + 1,
					name: tl.name,
					guid: tl.guid,
					creator: tl.creator?.id,
					memberCount: tl.members?.length || 0,
				}))
			);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			if (errorMsg.includes('401') || errorMsg.includes('403')) {
				new Notice('认证失败：Access Token 无效或已过期，请重新授权');
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				new Notice('网络错误：请检查网络连接');
			} else {
				new Notice('获取任务清单失败: ' + errorMsg);
			}

			Logger.error('SyncSettingsBuilder', 'Failed to fetch Feishu task lists', error);
		}
	}

	private async testSyncToTasklist(tasklistGuid: string, tasklistName: string): Promise<void> {
		const syncConfig = this.getSyncConfiguration();
		const apiConfig = syncConfig?.api;

		if (!apiConfig?.accessToken) {
			new Notice('请先完成飞书授权');
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice('请先配置飞书 App ID 和 App Secret');
			return;
		}

			const confirmed = await showConfirmDialog(
				this.plugin.app,
				'测试写入',
				'将向清单「' + tasklistName + '」中创建 5 个测试任务，\n' +
				'用于验证同步功能是否正常。\n\n确定继续？',
				{ confirmText: '开始写入', cancelText: '取消' }
			);
		if (!confirmed) return;

		try {
			const provider = new FeishuProvider({
				enabled: true,
				syncDirection: 'export-only',
				autoSync: false,
				syncInterval: 0,
				conflictResolution: 'local-win',
				api: {
					provider: 'feishu',
					accessToken: apiConfig.accessToken,
					refreshToken: apiConfig.refreshToken,
					tokenExpireAt: apiConfig.tokenExpireAt,
					clientId,
					clientSecret,
					redirectUri: apiConfig.redirectUri,
				},
			});

			provider.setConfigUpdateCallback(async (data: ConfigUpdateData) => {
				const api = syncConfig.api;
				if (api) {
					if (data.accessToken) api.accessToken = data.accessToken;
					if (data.refreshToken) api.refreshToken = data.refreshToken;
					if (data.tokenExpireAt) api.tokenExpireAt = data.tokenExpireAt;
				}
				await this.plugin.saveSettings();
			});

			new Notice('正在向「' + tasklistName + '」创建虚拟任务...', 5000);

			let created = 0;
			let failed = 0;
			const now = Date.now();

			for (let i = 1; i <= 5; i++) {
				try {
					const payload: any = {
						summary: '虚拟任务 ' + i + '/5 - ' + new Date().toLocaleString('zh-CN'),
						description: '由 Gantt Calendar 插件创建的连通性测试任务，可安全删除。',
						due: { timestamp: String(now + i * 24 * 60 * 60 * 1000) },
						priority: i <= 2 ? 'high' : 'normal',
						completed: false,
					};

					if (apiConfig.userOpenId) {
						payload.assignee = { id: apiConfig.userOpenId, type: 'open_id' };
					}

					await provider.createFeishuTask(payload, tasklistGuid);
					created++;

					if (i % 3 === 0) {
						new Notice('已创建 ' + created + '/5 个测试任务...');
					}
				} catch (err) {
					failed++;
					Logger.warn('SyncSettingsBuilder', 'Test task failed: ' + i, err);
				}
			}

			const msg = '测试写入完成: 成功 ' + created + ' 个' +
				(failed > 0 ? '，失败 ' + failed + ' 个' : '') +
				'\n清单: ' + tasklistName;
			new Notice(msg, 8000);
			Logger.info('SyncSettingsBuilder', 'Test write result', { tasklistGuid, created, failed });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Test write failed', error);
			new Notice('测试写入失败: ' + errorMsg);
		}
	}

	private async clearFeishuTasklistTasks(tasklistGuid: string, tasklistName: string): Promise<void> {
		const syncConfig = this.getSyncConfiguration();
		const apiConfig = syncConfig?.api;

		if (!apiConfig?.accessToken) {
			new Notice('请先完成飞书授权');
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice('请先配置飞书 App ID 和 App Secret');
			return;
		}

		try {
			new Notice('正在获取清单「' + tasklistName + '」中的任务...');

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tasks = await FeishuTaskApi.getTasksByTaskList(
				apiConfig.accessToken,
				tasklistGuid,
				tasklistName,
				requestFetch
			);

			if (tasks.length === 0) {
				new Notice('清单「' + tasklistName + '」中没有任务');
				return;
			}

			new Notice('找到 ' + tasks.length + ' 个任务，正在删除...');

			const provider = new FeishuProvider({
				enabled: true,
				syncDirection: 'export-only',
				autoSync: false,
				syncInterval: 0,
				conflictResolution: 'local-win',
				api: {
					provider: 'feishu',
					accessToken: apiConfig.accessToken,
					refreshToken: apiConfig.refreshToken,
					tokenExpireAt: apiConfig.tokenExpireAt,
					clientId,
					clientSecret,
					redirectUri: apiConfig.redirectUri,
				},
			});

			provider.setConfigUpdateCallback(async (data: ConfigUpdateData) => {
				const api = syncConfig.api;
				if (api) {
					if (data.accessToken) api.accessToken = data.accessToken;
					if (data.refreshToken) api.refreshToken = data.refreshToken;
					if (data.tokenExpireAt) api.tokenExpireAt = data.tokenExpireAt;
				}
				await this.plugin.saveSettings();
			});

			let deleted = 0;
			let failed = 0;

			for (const task of tasks) {
				try {
					await provider.deleteFeishuTask(task.task_guid);
					deleted++;
					if (deleted % 10 === 0) {
						new Notice('已删除 ' + deleted + '/' + tasks.length + ' 个任务...');
					}
				} catch (err) {
					failed++;
					Logger.warn('SyncSettingsBuilder', 'Failed to delete task: ' + task.task_guid, err);
				}
			}

			const msg = '清除完成: 删除 ' + deleted + ' 个' + (failed > 0 ? '，失败 ' + failed + ' 个' : '');
			new Notice(msg, 8000);
			Logger.info('SyncSettingsBuilder', 'Clear tasklist result:', { deleted, failed });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Failed to clear tasklist tasks', error);
			new Notice('清除任务失败: ' + errorMsg);
		}
	}
}
