import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://luhbezpflvmevorbayai.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aGJlenBmbHZtZXZvcmJheWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDI1NzcsImV4cCI6MjA4NDQxODU3N30.Q0YDNfg4WYvksj99zj_SxwfjjLYpWO5yigAJoh6F5VU"

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    console.log('Testing connectivity...')

    try {
        const start = Date.now()
        console.log('Querying sistema_assets limit 1...')

        // Check if assets table exists and is accessible
        const { data, error } = await supabase
            .from('sistema_assets')
            .select('id')
            .limit(1);

        if (error) {
            console.error('Error querying sistema_assets:', error)
        } else {
            console.log('Success querying sistema_assets. Data:', data)
        }

        // Insert test
        console.log('Creating temp user for auth test...')
        const email = `testuser${Date.now()}@quepia.com`
        const password = 'testpassword123'

        // Create new user or sign in
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        })

        if (authError) {
            console.error('Auth failed:', authError)
            return
        }

        const userId = authData.user?.id
        if (!userId) {
            console.error('No user ID returned')
            return
        }
        console.log('Authenticated as temp user:', userId)

        // Helper to run query as authenticated user
        const authedClient = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${authData.session?.access_token}` } }
        })

        // Create a project for this user so they are owner (and allowed to insert assets)
        console.log('Creating test project...')
        const { data: project, error: projError } = await authedClient
            .from('sistema_projects')
            .insert({
                nombre: 'TEST PROJ',
                owner_id: userId,
                icon: 'hash'
            })
            .select()
            .single()

        if (projError) {
            console.error('Project create failed:', projError)
            return
        }
        console.log('Test project created:', project.id)

        // Find a column (should have been created by trigger)
        const { data: col } = await authedClient
            .from('sistema_columns')
            .select('id')
            .eq('project_id', project.id)
            .limit(1)
            .single()

        // Create a task
        console.log('Creating test task...')
        const { data: task, error: taskError } = await authedClient
            .from('sistema_tasks')
            .insert({
                project_id: project.id,
                column_id: col?.id, // might be null if trigger failed, but lets try
                titulo: 'TEST TASK'
            })
            .select()
            .single()

        if (taskError) {
            console.error('Task create failed:', taskError)
            // If trigger failed to create columns, we cant create task easily without column. 
            // But let's assume triggers work or project insert worked.
            return
        }
        console.log('Test task created:', task.id)

        console.log('Attempting INSERT into sistema_assets...')
        const { data: asset, error: insertError } = await authedClient
            .from('sistema_assets')
            .insert({
                task_id: task.id,
                project_id: project.id,
                nombre: "TEST_ASSET_SCRIPT",
                created_by: userId
            })
            .select()
            .single()

        if (insertError) {
            console.error('INSERT FAILED:', insertError)
        } else {
            console.log('INSERT SUCCESS:', asset)
        }
        console.log(`Query took ${Date.now() - start}ms`)

    } catch (err) {
        console.error('Unexpected error:', err)
    }
}

test()
