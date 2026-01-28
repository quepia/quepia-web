import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://luhbezpflvmevorbayai.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aGJlenBmbHZtZXZvcmJheWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDI1NzcsImV4cCI6MjA4NDQxODU3N30.Q0YDNfg4WYvksj99zj_SxwfjjLYpWO5yigAJoh6F5VU"

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkFunction() {
    console.log('Checking for is_project_member function...')

    const { data, error } = await supabase
        .rpc('is_project_member', { p_id: '00000000-0000-0000-0000-000000000000', u_id: '00000000-0000-0000-0000-000000000000' })

    // We expect false (not found) or true.
    // If error says "function not found", then it's missing.
    // If error says "permission denied" or returns boolean, it exists.

    if (error) {
        console.log('Error calling function:', error.message)
        if (error.message.includes('function') && error.message.includes('not found')) {
            console.log('VERDICT: MISSING')
        } else {
            // Maybe it exists but arguments are wrong code or logic error
            console.log('VERDICT: UNKNOWN (Error present)')
        }
    } else {
        console.log('Function call success (returned ' + data + ')')
        console.log('VERDICT: EXISTS')
    }
}

checkFunction()
