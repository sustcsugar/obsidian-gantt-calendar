import { TaskCardClasses, ToolbarClasses } from '../src/utils/bem';

describe('BEM class mappings', () => {
	it('maps the sidebar task-card modifier', () => {
		expect(TaskCardClasses.modifiers.sidebarView).toBe('gc-task-card--sidebar');
	});

	it('maps the auto-collapse toolbar modifier', () => {
		expect(ToolbarClasses.modifiers.autoCollapse).toBe('gc-toolbar--auto-collapse');
		expect(ToolbarClasses.modifiers.expanded).toBe('gc-toolbar--expanded');
		expect(ToolbarClasses.modifiers.opening).toBe('gc-toolbar--opening');
	});
});
