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
import { i18n } from '../../i18n/i18n';

/**
 * Sync settings builder
 * Provides Feishu task sync configuration UI
 */
export class SyncSettingsBuilder extends BaseBuilder {
	// Temporary storage for pending authorization code
	private pendingAuthCode: string = '';

	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		const syncConfig = this.getSyncConfiguration();

		// ===== Disclaimer Banner =====
		this.renderSyncWarningBanner();

		// ===== Group 1: Feishu Task Sync =====
		this.createSettingGroup(i18n.t('settings.sync.groupTitle'), (group) => {
			const container = group instanceof HTMLElement ? group : this.containerEl;
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(container));
				}
			};

			// Feishu account connection
			this.renderFeishuSettings(group, syncConfig);

			// Fetch task lists button
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.taskList.name'))
					.setDesc(i18n.t('settings.sync.taskList.description'))
					.addButton(button => button
						.setButtonText(i18n.t('settings.sync.taskList.buttonText'))
						.onClick(async () => {
							await this.fetchFeishuTaskLists();
						}))
			);

			// Task list hints and cards
			this.renderTasklistCards(container, syncConfig);
		});

		// ===== Push Filter =====
		this.renderPushFilter();

		// ===== Group 2: Sync Config =====
		this.createSettingGroup(i18n.t('settings.sync.syncConfigGroupTitle'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// Feishu sync target file
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.targetFile.name'))
					.setDesc(i18n.t('settings.sync.targetFile.description'))
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

			// Sync direction
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.direction.name'))
					.setDesc(i18n.t('settings.sync.direction.description'))
					.addDropdown(drop => drop
						.addOptions({
							'bidirectional': i18n.t('settings.sync.direction.options.bidirectional'),
							'import-only': i18n.t('settings.sync.direction.options.importOnly'),
							'export-only': i18n.t('settings.sync.direction.options.exportOnly')
						})
						.setValue(syncConfig.syncDirection)
						.onChange(async (value) => {
							this.updateSyncConfig({ syncDirection: value as 'bidirectional' | 'import-only' | 'export-only' });
							await this.saveAndRefreshViews();
						}))
			);

			// Conflict resolution
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.conflictResolution.name'))
					.setDesc(i18n.t('settings.sync.conflictResolution.description'))
					.addDropdown(drop => drop
						.addOptions({
							'local-win': i18n.t('settings.sync.conflictResolution.options.localWin'),
							'remote-win': i18n.t('settings.sync.conflictResolution.options.remoteWin'),
							'newest-win': i18n.t('settings.sync.conflictResolution.options.newestWin'),
						})
						.setValue(syncConfig.conflictResolution)
						.onChange(async (value) => {
							this.updateSyncConfig({ conflictResolution: value as 'local-win' | 'remote-win' | 'newest-win' });
							await this.saveAndRefreshViews();
						}))
			);

			// Auto sync interval
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.autoSyncInterval.name'))
					.setDesc(i18n.t('settings.sync.autoSyncInterval.description'))
					.addSlider(slider => slider
						.setLimits(0, 120, 5)
						.setValue(syncConfig.syncInterval)
						.setDynamicTooltip()
						.onChange(async (value: number) => {
							this.updateSyncConfig({ syncInterval: value });
							await this.saveAndRefreshViews();
						}))
			);

			// Action buttons
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.manualSync.name'))
					.setDesc(i18n.t('settings.sync.manualSync.description'))
					.addButton(button => button
						.setButtonText(i18n.t('settings.sync.syncNow.button'))
						.setClass('mod-cta')
						.setDisabled(!syncConfig.api?.tasklistGuid)
						.onClick(async () => {
							const confirmed = await showConfirmDialog(
								this.plugin.app,
								i18n.t('settings.sync.syncNow.confirmTitle'),
							i18n.t('settings.sync.syncNow.confirmMessage'),
								{ confirmText: i18n.t('settings.sync.syncNow.confirmText'), cancelText: i18n.t('settings.sync.syncNow.cancelText') }
							);
							if (!confirmed) return;
							await this.runManualSync();
						}))
					.addButton(button => button
						.setButtonText(i18n.t('settings.sync.testSync.button'))
						.setTooltip(i18n.t('settings.sync.testSync.tooltip'))
						.setDisabled(!syncConfig.api?.tasklistGuid)
						.onClick(async () => {
							const confirmed = await showConfirmDialog(
								this.plugin.app,
								i18n.t('settings.sync.testSync.confirmTitle'),
							i18n.t('settings.sync.testSync.confirmMessage'),
								{ confirmText: i18n.t('settings.sync.testSync.confirmText'), cancelText: i18n.t('settings.sync.syncNow.cancelText') }
							);
							if (!confirmed) return;
							await this.runTestSync();
						}))
			);
		});
	}

	// ==================== Disclaimer Banner ====================

	private renderSyncWarningBanner(): void {
		const banner = this.containerEl.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING));

		const iconWrap = banner.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'icon'));
		iconWrap.setText('⚠️');

		const body = banner.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'body'));

		const title = body.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'title'));
		title.setText(i18n.t('settings.sync.disclaimer.title'));

		const desc = body.createDiv(bem(BLOCKS.SETTINGS_SYNC_WARNING, 'desc'));
		const line1 = desc.createDiv();
		line1.setText(i18n.t('settings.sync.disclaimer.warning'));

		const line2 = desc.createDiv();
		const strong = line2.createEl('strong');
		strong.setText(i18n.t('settings.sync.disclaimer.backupReminder'));
	}

	// ==================== Task List Cards ====================

	/**
	 * Render task list cards (within group)
	 */
	private renderTasklistCards(container: HTMLElement, syncConfig: any): void {
		const taskLists = syncConfig.api?.taskLists as FeishuTaskList[] || [];
		const selectedGuid = syncConfig.api?.tasklistGuid || '';

		// Hint when no lists fetched
		if (taskLists.length === 0) {
			const hintEl = container.createDiv('gc-sync-hint');
			hintEl.setText(i18n.t('settings.sync.statusHint.fetchFirst'));
			return;
		}

		// Selection status hint
		if (!selectedGuid) {
			const hintEl = container.createDiv('gc-sync-hint gc-sync-hint--warning');
			hintEl.setText(i18n.t('settings.sync.statusHint.notSelected'));
		} else {
			const selectedList = taskLists.find((tl: FeishuTaskList) => tl.guid === selectedGuid);
			const hintEl = container.createDiv('gc-sync-hint gc-sync-hint--success');
			const listName = selectedList?.name || selectedGuid;
			const prefix = hintEl.createSpan();
			hintEl.setText(i18n.t('settings.sync.statusHint.selected', { name: listName }));
			const nameSpan = hintEl.createSpan('gc-sync-hint__list-name');
			nameSpan.setText(listName);
			const suffix = hintEl.createSpan();
			// nameSpan removed; text merged into withSelection line above
		}

		// Task list cards
		const taskListEl = container.createDiv('gc-sync-tasklist');

		const headerEl = taskListEl.createDiv('gc-sync-tasklist__header');
		headerEl.textContent = i18n.t('settings.sync.statusHint.listTitle', { count: taskLists.length });

		const listEl = taskListEl.createDiv('gc-sync-tasklist__grid');

		taskLists.forEach((tl) => {
			const isSelected = tl.guid === selectedGuid;
			const itemEl = listEl.createDiv('gc-sync-tasklist-card');
			if (isSelected) {
				itemEl.addClass('gc-sync-tasklist-card--selected');
			}

			// Title
			const titleDiv = itemEl.createDiv('gc-sync-tasklist-card__name');
			titleDiv.setText((isSelected ? '✓ ' : '') + tl.name);

			// GUID
			const idDiv = itemEl.createDiv('gc-sync-tasklist-card__guid');
			idDiv.setText(tl.guid);

			// Creator
			if (tl.creator) {
				const creatorDiv = itemEl.createDiv('gc-sync-tasklist-card__meta');
				creatorDiv.setText(i18n.t('settings.sync.taskListCards.creator', { id: tl.creator.id }));
			}

			// Members
			if (tl.members && tl.members.length > 0) {
				const memberDiv = itemEl.createDiv('gc-sync-tasklist-card__meta');
				memberDiv.setText(i18n.t('settings.sync.taskListCards.members', { count: tl.members.length }));
			}

			// Button row
			const btnRow = itemEl.createDiv('gc-sync-tasklist-card__actions');

			// Select / Deselect button
			const selectBtn = btnRow.createEl('button');
			if (isSelected) {
				selectBtn.textContent = i18n.t('settings.sync.taskListCards.deselect');
				selectBtn.onclick = async () => {
					if (!syncConfig.api) syncConfig.api = {} as any;
					syncConfig.api.tasklistGuid = '';
					await this.saveAndRefreshAll();
					new Notice(i18n.t('settings.sync.taskListCards.deselectNotice'));
				};
			} else {
				selectBtn.textContent = i18n.t('settings.sync.taskListCards.select');
				selectBtn.onclick = async () => {
					const switching = !!selectedGuid;
					if (switching) {
							const confirmed = await showConfirmDialog(
								this.plugin.app,
								i18n.t('settings.sync.taskListCards.switchConfirmTitle'),
								i18n.t('settings.sync.taskListCards.switchConfirmMessage', { name: tl.name }),
								{ confirmText: i18n.t('settings.sync.taskListCards.switchConfirmButton'), cancelText: i18n.t('settings.sync.syncNow.cancelText') }
							);
						if (!confirmed) return;
					}
					if (!syncConfig.api) syncConfig.api = {} as any;
					syncConfig.api.tasklistGuid = tl.guid;
					await this.saveAndRefreshAll();
					const msg = i18n.t('settings.sync.taskListCards.switchNotice', { name: tl.name });
					const suffix = switching ? i18n.t('settings.sync.taskListCards.switchNoticeFullSync') : '';
					new Notice(msg + suffix);
				};
			}

			// Test write
			const testBtn = btnRow.createEl('button');
			testBtn.textContent = i18n.t('settings.sync.taskListCards.testWrite');
			testBtn.title = i18n.t('settings.sync.taskListCards.testWriteTitle');
			testBtn.onclick = async () => {
				await this.testSyncToTasklist(tl.guid, tl.name);
			};

			// Clear tasks
			const clearBtn = btnRow.createEl('button');
			clearBtn.textContent = i18n.t('settings.sync.taskListCards.clearTasks');
			clearBtn.title = i18n.t('settings.sync.taskListCards.clearTasksTitle');
			clearBtn.className = 'mod-warning';
			clearBtn.onclick = async () => {
					const confirmed = await showConfirmDialog(
						this.plugin.app,
						i18n.t('settings.sync.taskListCards.clearConfirmTitle'),
						i18n.t('settings.sync.taskListCards.clearConfirmMessage', { name: tl.name }),
						{ confirmText: i18n.t('settings.sync.taskListCards.clearConfirmButton'), cancelText: i18n.t('settings.sync.syncNow.cancelText'), isDestructive: true }
					);
				if (!confirmed) return;
				await this.clearFeishuTasklistTasks(tl.guid, tl.name);
			};
		});
	}

	// ==================== Feishu Account Settings ====================

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

		// Connection status + authorize button
		addSetting(setting =>
			setting.setName(i18n.t('settings.sync.account.name'))
				.setDesc(isConnected ? i18n.t('settings.sync.account.connected') : i18n.t('settings.sync.account.disconnected'))
				.addButton(button => button
					.setButtonText(isConnected ? i18n.t('settings.sync.account.reconnect') : i18n.t('settings.sync.account.connect'))
					.setClass('mod-cta')
					.onClick(() => {
						this.initiateFeishuOAuth(syncConfig);
					}))
		);

		// App ID
		addSetting(setting =>
			setting.setName('App ID')
				.setDesc(i18n.t('settings.sync.oauth.appId.description'))
				.addText(text => text
					 
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- 凭据占位符
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
			setting.setName('App secret')
				.setDesc(i18n.t('settings.sync.oauth.appSecret.description'))
				.addText(text => text
					 
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- 凭据占位符
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

		// Redirect URL
		addSetting(setting =>
			setting.setName(i18n.t('settings.sync.oauth.redirectUri.label'))
				.setDesc(i18n.t('settings.sync.oauth.redirectUri.description'))
				.addText(text => text
					 
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- URL 占位符,大小写敏感
					.setPlaceholder('https://open.feishu.cn/api-explorer/loading')
					.setValue(syncConfig.api?.redirectUri || FeishuOAuth.getDefaultRedirectUri())
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, redirectUri: value }
						});
						await this.saveAndRefreshViews();
					}))
		);

		// Authorization code input
		addSetting(setting =>
			setting.setName(i18n.t('settings.sync.oauth.authCode.label'))
				.setDesc(i18n.t('settings.sync.oauth.authCode.description'))
				.addText(text => text
					.setPlaceholder(i18n.t('settings.sync.oauth.authCode.placeholder'))
					.onChange((value: string) => {
						this.pendingAuthCode = value.trim();
					}))
				.addButton(button => button
					.setButtonText(i18n.t('settings.sync.oauth.getToken'))
					.setClass('mod-cta')
					.onClick(async () => {
						if (!this.pendingAuthCode || this.pendingAuthCode.length < 10) {
							new Notice(i18n.t('settings.sync.oauth.invalidCodeNotice'));
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

		// Authorized info
		if (isConnected && syncConfig.api?.accessToken) {
			if (syncConfig.api?.userName || syncConfig.api?.userId) {
				addSetting(setting =>
					setting.setName(i18n.t('settings.sync.oauth.authorizedUser.label'))
						.setDesc(syncConfig.api?.userName ? `${syncConfig.api?.userName} (${syncConfig.api?.userId || 'Unknown'})` : syncConfig.api?.userId || 'Unknown')
						.addExtraButton(button => button
							.setIcon('user')
							.setTooltip(i18n.t('settings.sync.oauth.testConnectionTooltip'))
							.onClick(() => this.testFeishuConnection(syncConfig)))
				);
			}

			// Access Token (partially hidden)
			addSetting(setting =>
				setting.setName('Access token')
					.setDesc(i18n.t('settings.sync.oauth.accessToken.description'))
					.addText(text => text
						.setValue(this.maskToken(syncConfig.api?.accessToken ?? ''))
						.setDisabled(true))
					.addExtraButton(button => button
						.setIcon('copy')
						.setTooltip(i18n.t('settings.sync.oauth.copyTokenTooltip'))
						.onClick(() => {
							navigator.clipboard.writeText(syncConfig.api?.accessToken ?? '');
							new Notice(i18n.t('settings.sync.oauth.copiedNotice'));
						}))
			);

			// Token expiration
			if (syncConfig.api?.tokenExpireAt) {
				const expireTime = new Date(syncConfig.api?.tokenExpireAt ?? 0);
				const isExpired = Date.now() > (syncConfig.api?.tokenExpireAt ?? 0);
				const remainingText = FeishuOAuth.formatExpireTime(syncConfig.api?.tokenExpireAt ?? 0);

				addSetting(setting =>
					setting.setName(i18n.t('settings.sync.oauth.tokenStatus.label'))
						.setDesc(isExpired ? i18n.t('settings.sync.oauth.tokenStatus.expired') : i18n.t('settings.sync.oauth.tokenStatus.expiresAt', { time: expireTime.toLocaleString(), remaining: remainingText }))
						.addExtraButton(button => button
							.setIcon(isExpired ? 'alert-triangle' : 'check-circle')
							.setTooltip(isExpired ? i18n.t('settings.sync.oauth.tokenStatus.expiredTooltip') : i18n.t('settings.sync.oauth.tokenStatus.validTooltip')))
						.addButton(btn => btn
							.setButtonText(i18n.t('settings.sync.oauth.refresh'))
							.setTooltip(isExpired ? i18n.t('settings.sync.oauth.reauthorize') : i18n.t('settings.sync.oauth.tryRefreshToken'))
							.onClick(() => isExpired ? this.initiateFeishuOAuth(syncConfig) : this.refreshFeishuToken(syncConfig)))
				);
			}
		}

		
			// Refresh token status
			if (syncConfig.api?.refreshToken) {
				addSetting(setting => {
					const hasExpireAt = !!syncConfig.api?.refreshTokenExpireAt;
					const isExpired = hasExpireAt && Date.now() > (syncConfig.api?.refreshTokenExpireAt ?? 0);
					const desc = hasExpireAt
						? (isExpired
							? i18n.t('settings.sync.oauth.refreshTokenStatus.expired')
							: i18n.t('settings.sync.oauth.refreshTokenStatus.valid', { time: new Date(syncConfig.api?.refreshTokenExpireAt ?? 0).toLocaleString(), remaining: FeishuOAuth.formatExpireTime(syncConfig.api?.refreshTokenExpireAt ?? 0) }))
						: i18n.t('settings.sync.oauth.refreshTokenStatus.unknown');
					setting.setName(i18n.t('settings.sync.oauth.refreshTokenStatus.label'))
						.setDesc(desc)
						.addExtraButton(button => button
							.setIcon(isExpired ? 'alert-triangle' : (hasExpireAt ? 'check-circle' : 'info'))
							.setTooltip(isExpired ? i18n.t('settings.sync.oauth.tokenStatus.expiredTooltip') : (hasExpireAt ? i18n.t('settings.sync.oauth.tokenStatus.validTooltip') : i18n.t('settings.sync.oauth.refreshTokenStatus.unknownTooltip'))));
				});
			}
			// Revoke authorization
		if (isConnected) {
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.oauth.resetAuth.label'))
					.setDesc(i18n.t('settings.sync.oauth.resetAuth.description'))
					.addButton(button => button
						.setButtonText(i18n.t('settings.sync.oauth.resetAuth.button'))
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
							new Notice(i18n.t('settings.sync.oauth.resetAuth.notice'));
						}))
			);
		}
	}

	// ==================== OAuth Flow ====================

	private initiateFeishuOAuth(_syncConfig: any): void {
		const currentSyncConfig = this.getSyncConfiguration();
		const apiConfig = currentSyncConfig.api;
		const clientId = apiConfig?.clientId || apiConfig?.appId;

		if (!clientId) {
			new Notice(i18n.t('settings.sync.oauth.pleaseConfigureAppId'));
			return;
		}

		const authUrl = FeishuOAuth.getAuthUrl({
			clientId: clientId,
			clientSecret: apiConfig?.clientSecret || apiConfig?.appSecret || '',
			redirectUri: apiConfig?.redirectUri || FeishuOAuth.getDefaultRedirectUri(),
		});

		window.open(authUrl, '_blank');
		new Notice(i18n.t('settings.sync.oauth.completeAuthInBrowser'));
	}

	private async exchangeFeishuAuthCode(_syncConfig: any, code: string): Promise<void> {
		try {
			new Notice(i18n.t('settings.sync.oauth.exchangingCode'));

			const currentSyncConfig = this.getSyncConfiguration();
			const apiConfig = currentSyncConfig.api;

			const clientId = apiConfig?.clientId || apiConfig?.appId || '';
			const clientSecret = apiConfig?.clientSecret || apiConfig?.appSecret || '';

			if (!clientId) {
				new Notice(i18n.t('settings.sync.oauth.pleaseConfigureAppIdAndSecret'));
				return;
			}

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tokenResponse = await FeishuOAuth.exchangeCodeForToken({
				clientId,
				clientSecret,
			}, code, requestFetch);

			if (!tokenResponse.access_token) {
				throw new Error(i18n.t('settings.sync.oauth.apiMissingAccessToken'));
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
				Logger.warn('SyncSettingsBuilder', i18n.t('settings.sync.notices.getUserInfoFailed'), e);
			}

			this.updateSyncConfig({ api: updateData });
			await this.saveAndRefreshViews();
			new Notice(i18n.t('settings.sync.oauth.authSuccess'));
			await this.saveAndRefreshAll();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Authorization failed', error);
			if (errorMsg.includes('invalid_grant') || errorMsg.includes('expired') || errorMsg.includes('过期') || errorMsg.includes('invalid_grant')) {
				new Notice(i18n.t('settings.sync.oauth.codeExpired'), 8000);
			} else {
				new Notice(i18n.t('settings.sync.oauth.authFailed', { error: errorMsg }), 8000);
			}
		}
	}

	private async refreshFeishuToken(_syncConfig: any): Promise<void> {
		try {
			new Notice(i18n.t('settings.sync.oauth.tokenRefreshing'));

			const currentSyncConfig = this.getSyncConfiguration();
			const apiConfig = currentSyncConfig.api;

			const clientId = apiConfig?.clientId || apiConfig?.appId || '';
			const clientSecret = apiConfig?.clientSecret || apiConfig?.appSecret || '';
			const refreshToken = apiConfig?.refreshToken;

			if (!clientId) {
				new Notice(i18n.t('settings.sync.oauth.pleaseConfigureAppId'));
				return;
			}

			if (!refreshToken) {
				new Notice(i18n.t('settings.sync.oauth.noRefreshToken'));
				return;
			}

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tokenResponse = await FeishuOAuth.refreshAccessToken({
				clientId,
				clientSecret,
				refreshToken,
			}, requestFetch);

			if (!tokenResponse.access_token) {
				throw new Error(i18n.t('settings.sync.oauth.apiMissingAccessToken'));
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
			new Notice(i18n.t('settings.sync.oauth.tokenRefreshSuccess'));
			await this.saveAndRefreshAll();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(i18n.t('settings.sync.oauth.tokenRefreshFailed', { error: errorMsg }));
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

	// ==================== Connection Test ====================

	private async testFeishuConnection(syncConfig: any): Promise<void> {
		const apiConfig = syncConfig.api;

		if (!apiConfig?.accessToken) {
			new Notice(i18n.t('settings.sync.connectionTest.unauthorized'));
			return;
		}

		const isExpired = apiConfig.tokenExpireAt && Date.now() > apiConfig.tokenExpireAt;
		const expireInfo = apiConfig.tokenExpireAt
			? FeishuOAuth.formatExpireTime(apiConfig.tokenExpireAt)
			: i18n.t('settings.sync.connectionTest.expireUnknown');

		new Notice(i18n.t('settings.sync.connectionTest.testing'));

		try {
			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const userInfo = await FeishuUserApi.getUserInfo(apiConfig.accessToken, requestFetch);

			const parts: string[] = [];
			parts.push(i18n.t('settings.sync.connectionTest.success'));
			parts.push('');
			parts.push(i18n.t('settings.sync.connectionTest.userInfo'));
			parts.push(i18n.t('settings.sync.connectionTest.userName', { name: userInfo.name }));
			if (userInfo.enName) parts.push(i18n.t('settings.sync.connectionTest.userEnName', { enName: userInfo.enName }));
			parts.push(i18n.t('settings.sync.connectionTest.userId', { userId: userInfo.userId }));
			parts.push(`  OpenID: ${userInfo.openId}`);
			if (userInfo.email) if (userInfo.email) parts.push(i18n.t('settings.sync.connectionTest.email', { email: userInfo.email }));

			parts.push('');
			parts.push(i18n.t('settings.sync.connectionTest.tokenInfo'));
			parts.push(i18n.t('settings.sync.connectionTest.expireTime', { time: new Date(apiConfig.tokenExpireAt ?? 0).toLocaleString() }));
			parts.push(isExpired ? i18n.t('settings.sync.connectionTest.tokenExpired') : i18n.t('settings.sync.connectionTest.tokenExpiredStatus', { status: i18n.t('settings.sync.oauth.tokenStatus.expiresAt', { time: new Date(apiConfig.tokenExpireAt ?? 0).toLocaleString(), remaining: expireInfo }) }));

			parts.push('');
			const taskListCount = syncConfig.api?.taskLists?.length || 0;
			parts.push(i18n.t('settings.sync.connectionTest.authorizedLists', { count: taskListCount }));
			if (syncConfig.api?.tasklistGuid) {
				const selectedList = syncConfig.api?.taskLists?.find((tl: FeishuTaskList) => tl.guid === syncConfig.api?.tasklistGuid);
				if (selectedList) {
					parts.push(i18n.t('settings.sync.connectionTest.currentList', { name: selectedList.name }));
				}
			}

			new Notice(parts.join('\n'), 10000);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			const parts: string[] = [];
			parts.push(i18n.t('settings.sync.connectionTest.failed'));
			parts.push('');
			parts.push(i18n.t('settings.sync.connectionTest.errorInfo', { error: errorMsg }));

			const codeMatch = errorMsg.match(/Error code[：:]\s*(\d+)/i) || errorMsg.match(/错误码[：:]\s*(\d+)/) || errorMsg.match(/code[：:]\s*(\d+)/i);
			if (codeMatch) {
				parts.push(i18n.t('settings.sync.connectionTest.errorCode', { code: codeMatch[1] }));
			}

			parts.push('');
			parts.push(i18n.t('settings.sync.connectionTest.tokenInfo'));
			if (apiConfig.tokenExpireAt) {
				parts.push(i18n.t('settings.sync.connectionTest.expireTime', { time: new Date(apiConfig.tokenExpireAt ?? 0).toLocaleString() }));
			}
			const tokenStatusText = isExpired ? i18n.t('settings.sync.oauth.tokenStatus.expired') : i18n.t('settings.sync.oauth.tokenStatus.expiresAt', { time: new Date(apiConfig.tokenExpireAt ?? 0).toLocaleString(), remaining: expireInfo });
			parts.push(i18n.t('settings.sync.connectionTest.tokenExpiredStatus', { status: tokenStatusText }));

			if (errorMsg.includes('401')) {
				parts.push('');
				parts.push(i18n.t('settings.sync.connectionTest.possible401'));
				parts.push(i18n.t('settings.sync.connectionTest.possible401'));
			} else if (errorMsg.includes('403')) {
				parts.push('');
				parts.push(i18n.t('settings.sync.connectionTest.possible403'));
				parts.push(i18n.t('settings.sync.connectionTest.possible403'));
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				parts.push('');
				parts.push(i18n.t('settings.sync.connectionTest.possibleNetwork'));
				parts.push(i18n.t('settings.sync.connectionTest.possibleNetwork'));
			}

			new Notice(parts.join('\n'), 12000);
			Logger.error('SyncSettingsBuilder', 'Connection test failed', error);
		}
	}



	// ==================== Push Filter ====================

	/**
	 * Render push filter settings
	 * Provides combined filters across status, tags, priority, and path dimensions
	 */
	private renderPushFilter(): void {
		const syncConfig = this.getSyncConfiguration();
		const pushFilter: PushFilterConfig = syncConfig.pushFilter || DEFAULT_PUSH_FILTER;

		this.createSettingGroup(i18n.t('settings.sync.groupTitles.pushFilter'), (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// Enable toggle
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.pushFilter.enabled.name'))
					.setDesc(i18n.t('settings.sync.pushFilter.enabled.description'))
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

			// Completion status filter
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.pushFilter.completionStatus.name'))
					.setDesc(i18n.t('settings.sync.pushFilter.completionStatus.description'))
					.addDropdown(drop => drop
						.addOptions({
							'all': i18n.t('settings.sync.pushFilter.completionStatus.options.all'),
							'incomplete-only': i18n.t('settings.sync.pushFilter.completionStatus.options.incompleteOnly'),
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

			// Date filter
			addSetting(setting => {
				const dateSetting = setting.setName(i18n.t('settings.sync.pushFilter.dateFilter.name'))
					.setDesc(i18n.t('settings.sync.pushFilter.dateFilter.description'))
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
						btn.setButtonText(i18n.t('settings.sync.pushFilter.dateFilter.all'));
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
						btn.setButtonText(i18n.t('settings.sync.pushFilter.dateFilter.lastWeek'));
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
						btn.setButtonText(i18n.t('settings.sync.pushFilter.dateFilter.lastMonth'));
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
						btn.setButtonText(i18n.t('settings.sync.pushFilter.dateFilter.last3Months'));
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
						btn.setButtonText(i18n.t('settings.sync.pushFilter.dateFilter.last6Months'));
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
						btn.setButtonText(i18n.t('settings.sync.pushFilter.dateFilter.lastYear'));
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
				// Initial state: highlight "All" when no date filter
				if (!pushFilter.sinceDate && quickBtns.length > 0) {
					quickBtns[0].classList.add('mod-cta');
				}
			});
// Path filter
			addSetting(setting =>
				setting.setName(i18n.t('settings.sync.pushFilter.pathFilter.name'))
					.setDesc(i18n.t('settings.sync.pushFilter.pathFilter.description'))
					.addTextArea(text => {
						text.setPlaceholder(i18n.t('settings.sync.pushFilter.pathFilter.placeholder'))
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

	// ==================== Sync Operations ====================

		private async runManualSync(): Promise<void> {
		await syncFeishuTasks(this.plugin);
	}

	private async runTestSync(): Promise<void> {
		try {
			const syncConfig = this.getSyncConfiguration();
			const apiConfig = syncConfig.api;

			if (!apiConfig?.accessToken) {
				new Notice(i18n.t('settings.sync.notices.authRequired'));
				return;
			}

			const clientId = apiConfig.clientId || apiConfig.appId;
			const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

			if (!clientId || !clientSecret) {
				new Notice(i18n.t('settings.sync.notices.configRequired'));
				return;
			}

			const tasklistGuid = apiConfig.tasklistGuid;
			if (!tasklistGuid) {
				new Notice(i18n.t('settings.sync.notices.selectTaskList'));
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
				new Notice(i18n.t('settings.sync.connectionTest.authExpired'), 8000);
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
			if (result.pushed > 0) parts.push(result.pushed + ' ' + i18n.t('modals.syncResult.pushed'));
			if (result.pulled > 0) parts.push(result.pulled + ' ' + i18n.t('modals.syncResult.pulled'));
			const summary = parts.length > 0 ? parts.join(', ') : i18n.t('modals.syncResult.noChange');

			// Show detailed result modal when changes exist
			if (result.details.length > 0) {
				showSyncResultModal(this.plugin.app, i18n.t('settings.sync.testSync.complete', { summary }), result);
			} else if (result.errors.length > 0) {
				new Notice(i18n.t('settings.sync.testSync.completeWithErrors', { summary, errors: result.errors.join('\n') }), 10000);
			} else {
				new Notice(i18n.t('settings.sync.testSync.complete', { summary }));
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(i18n.t('settings.sync.testSync.error', { error: errorMsg }));
		}
	}

	// ==================== Task List Operations ====================

	private async fetchFeishuTaskLists(): Promise<void> {
		new Notice(i18n.t('settings.sync.notices.fetchingTaskLists'));

		try {
			const config = this.getSyncConfiguration();
			const accessToken = config.api?.accessToken;

			if (!accessToken) {
				new Notice(i18n.t('settings.sync.notices.authRequired'));
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
				new Notice(i18n.t('settings.sync.notices.noTaskLists'));
			} else {
				new Notice(i18n.t('settings.sync.notices.taskListsFetched', { count: taskLists.length }));
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
				new Notice(i18n.t('settings.sync.notices.authFailed401'));
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				new Notice(i18n.t('settings.sync.notices.networkError'));
			} else {
				new Notice(i18n.t('settings.sync.notices.fetchFailed', { error: errorMsg }));
			}

			Logger.error('SyncSettingsBuilder', 'Failed to fetch Feishu task lists', error);
		}
	}

	private async testSyncToTasklist(tasklistGuid: string, tasklistName: string): Promise<void> {
		const syncConfig = this.getSyncConfiguration();
		const apiConfig = syncConfig?.api;

		if (!apiConfig?.accessToken) {
			new Notice(i18n.t('settings.sync.notices.authRequired'));
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice(i18n.t('settings.sync.notices.configRequired'));
			return;
		}

			const confirmed = await showConfirmDialog(
				this.plugin.app,
				i18n.t('settings.sync.taskListCards.testWrite'),
				i18n.t('settings.sync.testWrite.confirmMessage', { name: tasklistName }),
				{ confirmText: i18n.t('settings.sync.testWrite.confirmButton'), cancelText: i18n.t('settings.sync.syncNow.cancelText') }
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

			new Notice(i18n.t('settings.sync.testWrite.creating', { name: tasklistName }), 5000);

			let created = 0;
			let failed = 0;
			const now = Date.now();

			for (let i = 1; i <= 5; i++) {
				try {
					const payload: any = {
						summary: i18n.t('settings.sync.testWrite.virtualTaskTitle', { index: i, time: new Date().toLocaleString() }),
						description: i18n.t('settings.sync.testWrite.virtualTaskDesc'),
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
						new Notice(i18n.t('settings.sync.testWrite.progress', { current: created }));
					}
				} catch (err) {
					failed++;
					Logger.warn('SyncSettingsBuilder', 'Test task failed: ' + i, err);
				}
			}

			const failedPart = failed > 0 ? i18n.t('settings.sync.testWrite.resultFailed', { failed }) : '';
				const msg = i18n.t('settings.sync.testWrite.result', { created, failed: failedPart }) + i18n.t('settings.sync.testWrite.listLabel', { name: tasklistName });
			new Notice(msg, 8000);
			Logger.info('SyncSettingsBuilder', 'Test write result', { tasklistGuid, created, failed });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Test write failed', error);
			new Notice(i18n.t('settings.sync.testWrite.failed', { error: errorMsg }));
		}
	}

	private async clearFeishuTasklistTasks(tasklistGuid: string, tasklistName: string): Promise<void> {
		const syncConfig = this.getSyncConfiguration();
		const apiConfig = syncConfig?.api;

		if (!apiConfig?.accessToken) {
			new Notice(i18n.t('settings.sync.notices.authRequired'));
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice(i18n.t('settings.sync.notices.configRequired'));
			return;
		}

		try {
			new Notice(i18n.t('settings.sync.clearTasks.fetching', { name: tasklistName }));

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tasks = await FeishuTaskApi.getTasksByTaskList(
				apiConfig.accessToken,
				tasklistGuid,
				tasklistName,
				requestFetch
			);

			if (tasks.length === 0) {
				new Notice(i18n.t('settings.sync.clearTasks.empty', { name: tasklistName }));
				return;
			}

			new Notice(i18n.t('settings.sync.clearTasks.deleting', { count: tasks.length }));

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
						new Notice(i18n.t('settings.sync.clearTasks.progress', { current: deleted, total: tasks.length }));
					}
				} catch (err) {
					failed++;
					Logger.warn('SyncSettingsBuilder', 'Failed to delete task: ' + task.task_guid, err);
				}
			}

			const failedPart = failed > 0 ? i18n.t('settings.sync.clearTasks.resultFailed', { failed }) : '';
				const msg = i18n.t('settings.sync.clearTasks.result', { deleted, failed: failedPart });
			new Notice(msg, 8000);
			Logger.info('SyncSettingsBuilder', 'Clear tasklist result:', { deleted, failed });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Failed to clear tasklist tasks', error);
			new Notice(i18n.t('settings.sync.clearTasks.failed', { error: errorMsg }));
		}
	}
}
