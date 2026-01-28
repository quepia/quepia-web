import { render } from '@react-email/components';
import GeneralNotificationEmail from '../components/emails/GeneralNotificationEmail';
import ApprovalRequestEmail from '../components/emails/ApprovalRequestEmail';
import DailyDigestEmail from '../components/emails/DailyDigestEmail';
import MentionEmail from '../components/emails/MentionEmail';
import ContactFormEmail from '../components/emails/ContactFormEmail';
import * as React from 'react';

async function test() {
    const templates = [
        { name: 'GeneralNotification', comp: GeneralNotificationEmail, props: { recipientName: 'Test', title: 'Test', content: 'Content' } },
        { name: 'ApprovalRequest', comp: ApprovalRequestEmail, props: { assetName: 'Asset', assetUrl: '#', previewUrl: '#', projectByName: 'Project', approverName: 'User', actionUrl: '#' } },
        { name: 'DailyDigest', comp: DailyDigestEmail, props: { userName: 'User', pendingTasks: [], upcomingEvents: [] } },
        { name: 'Mention', comp: MentionEmail, props: { mentionerName: 'User A', contextName: 'Task B', content: 'Hello', actionUrl: '#' } },
        { name: 'ContactForm', comp: ContactFormEmail, props: { name: 'Lead', email: 'test@test.com', service: 'Design', message: 'Hello' } },
    ];

    console.log('Starting render tests...');

    for (const t of templates) {
        try {
            console.log(`Rendering ${t.name}...`);
            await render(t.comp(t.props as any));
            console.log(`✅ ${t.name} passed.`);
        } catch (error) {
            console.error(`❌ ${t.name} failed:`, error);
        }
    }
}

test();
