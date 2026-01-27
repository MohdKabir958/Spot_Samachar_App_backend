import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // ============================================
    // ADMIN USERS (3 pre-seeded accounts)
    // ============================================

    const adminPassword = await bcrypt.hash('Admin@123', 12);
    const mod1Password = await bcrypt.hash('Mod@123', 12);
    const mod2Password = await bcrypt.hash('Mod@456', 12);

    const superAdmin = await prisma.user.upsert({
        where: { email: 'admin@spotsamachar.com' },
        update: {},
        create: {
            email: 'admin@spotsamachar.com',
            phone: '9999999999',
            password: adminPassword,
            name: 'Super Admin',
            role: 'ADMIN',
            isVerified: true,
            isActive: true,
            credibilityScore: 100,
        },
    });
    console.log('✅ Super Admin created:', superAdmin.email);

    const moderator1 = await prisma.user.upsert({
        where: { email: 'moderator1@spotsamachar.com' },
        update: {},
        create: {
            email: 'moderator1@spotsamachar.com',
            password: mod1Password,
            name: 'Moderator One',
            role: 'ADMIN',
            isVerified: true,
            isActive: true,
            credibilityScore: 100,
        },
    });
    console.log('✅ Moderator 1 created:', moderator1.email);

    const moderator2 = await prisma.user.upsert({
        where: { email: 'moderator2@spotsamachar.com' },
        update: {},
        create: {
            email: 'moderator2@spotsamachar.com',
            password: mod2Password,
            name: 'Moderator Two',
            role: 'ADMIN',
            isVerified: true,
            isActive: true,
            credibilityScore: 100,
        },
    });
    console.log('✅ Moderator 2 created:', moderator2.email);

    // ============================================
    // SAMPLE CITIZENS
    // ============================================

    const citizenPassword = await bcrypt.hash('citizen123', 12);
    const citizen = await prisma.user.upsert({
        where: { phone: '9876543210' },
        update: {},
        create: {
            phone: '9876543210',
            email: 'rahul@example.com',
            password: citizenPassword,
            name: 'Rahul Kumar',
            role: 'CITIZEN',
            isActive: true,
            city: 'Mumbai',
            state: 'Maharashtra',
        },
    });
    console.log('✅ Citizen user created:', citizen.phone);

    const reporterPassword = await bcrypt.hash('reporter123', 12);
    const reporter = await prisma.user.upsert({
        where: { phone: '9123456789' },
        update: {},
        create: {
            phone: '9123456789',
            email: 'priya@example.com',
            password: reporterPassword,
            name: 'Priya Sharma',
            role: 'VERIFIED_REPORTER',
            isVerified: true,
            isActive: true,
            credibilityScore: 75,
            city: 'Delhi',
            state: 'Delhi',
            bio: 'Independent journalist covering local news',
        },
    });
    console.log('✅ Verified reporter created:', reporter.phone);

    // ============================================
    // POLICE STATIONS
    // ============================================

    const policeStations = [
        {
            name: 'Andheri Police Station',
            stationType: 'SUB_STATION',
            address: 'Andheri West, SV Road',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400058',
            phone: '022-26281111',
            email: 'andheri.ps@mahapolice.gov.in',
            latitude: 19.1196,
            longitude: 72.8464,
        },
        {
            name: 'Bandra Police Station',
            stationType: 'SUB_STATION',
            address: 'Bandra West, Hill Road',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400050',
            phone: '022-26422222',
            email: 'bandra.ps@mahapolice.gov.in',
            latitude: 19.0540,
            longitude: 72.8397,
        },
        {
            name: 'Mumbai Police Headquarters',
            stationType: 'HQ',
            address: 'Crawford Market, DN Road',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            phone: '022-22621855',
            email: 'hq@mahapolice.gov.in',
            latitude: 18.9437,
            longitude: 72.8353,
        },
        {
            name: 'Connaught Place Police Station',
            stationType: 'SUB_STATION',
            address: 'Block A, Connaught Place',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110001',
            phone: '011-23456789',
            email: 'cp.ps@delhipolice.gov.in',
            latitude: 28.6315,
            longitude: 77.2167,
        },
        {
            name: 'Cyber Crime Cell',
            stationType: 'SPECIALIZED',
            address: 'BKC, Bandra East',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400051',
            phone: '022-26501234',
            email: 'cybercrime@mahapolice.gov.in',
            latitude: 19.0596,
            longitude: 72.8656,
        },
    ];

    const createdStations = [];
    for (const station of policeStations) {
        const created = await prisma.policeStation.upsert({
            where: { id: station.name.replace(/\s/g, '-').toLowerCase() },
            update: station,
            create: station,
        });
        createdStations.push(created);
    }
    console.log('✅ Police stations created:', policeStations.length);

    // ============================================
    // POLICE USERS (created by admin)
    // ============================================

    const policePassword = await bcrypt.hash('Police@123', 12);

    // Link police users to their stations
    const policeUser1 = await prisma.user.upsert({
        where: { email: 'inspector.andheri@mahapolice.gov.in' },
        update: {},
        create: {
            email: 'inspector.andheri@mahapolice.gov.in',
            password: policePassword,
            name: 'Inspector Rajesh Patil',
            role: 'POLICE',
            isVerified: true,
            isActive: true,
            credibilityScore: 100,
            policeStationId: createdStations[0].id, // Andheri
        },
    });
    console.log('✅ Police user created:', policeUser1.email);

    const policeUser2 = await prisma.user.upsert({
        where: { email: 'inspector.bandra@mahapolice.gov.in' },
        update: {},
        create: {
            email: 'inspector.bandra@mahapolice.gov.in',
            password: policePassword,
            name: 'Inspector Meera Deshmukh',
            role: 'POLICE',
            isVerified: true,
            isActive: true,
            credibilityScore: 100,
            policeStationId: createdStations[1].id, // Bandra
        },
    });
    console.log('✅ Police user created:', policeUser2.email);

    const policeUser3 = await prisma.user.upsert({
        where: { email: 'dcp.mumbai@mahapolice.gov.in' },
        update: {},
        create: {
            email: 'dcp.mumbai@mahapolice.gov.in',
            password: policePassword,
            name: 'DCP Vikram Singh',
            role: 'POLICE',
            isVerified: true,
            isActive: true,
            credibilityScore: 100,
            policeStationId: createdStations[2].id, // HQ
        },
    });
    console.log('✅ Police user created:', policeUser3.email);

    // ============================================
    // SAMPLE INCIDENTS
    // ============================================

    const incidents = [
        {
            title: 'Road accident near Andheri station',
            description: 'Two vehicles collided near Andheri railway station. Traffic is heavily affected. Police and ambulance on the scene.',
            category: 'ACCIDENT',
            latitude: 19.1197,
            longitude: 72.8468,
            address: 'Near Andheri Railway Station, SV Road',
            city: 'Mumbai',
            state: 'Maharashtra',
            status: 'VERIFIED',
            publisherId: citizen.id,
            publisherBadge: 'CITIZEN',
            policeStationId: createdStations[0].id,
            viewCount: 145,
            shareCount: 23,
        },
        {
            title: 'Fire in residential building',
            description: 'Major fire broke out on the 5th floor of a residential building in Bandra. Fire brigade is working to control the situation. Residents have been evacuated.',
            category: 'FIRE',
            latitude: 19.0543,
            longitude: 72.8398,
            address: 'Hill Road, Bandra West',
            city: 'Mumbai',
            state: 'Maharashtra',
            status: 'VERIFIED',
            publisherId: reporter.id,
            publisherBadge: 'VERIFIED_REPORTER',
            policeStationId: createdStations[1].id,
            viewCount: 892,
            shareCount: 156,
        },
        {
            title: 'Water logging at Connaught Place',
            description: 'Heavy rains have caused severe water logging in CP area. Several shops affected. Municipal workers are draining the water.',
            category: 'CIVIC_ISSUE',
            latitude: 28.6320,
            longitude: 77.2170,
            address: 'Block B, Connaught Place',
            city: 'New Delhi',
            state: 'Delhi',
            status: 'SUBMITTED',
            publisherId: citizen.id,
            publisherBadge: 'CITIZEN',
        },
        {
            title: 'Chain snatching incident near Metro',
            description: 'A woman was robbed near Metro station exit. Two suspects on motorcycle fled towards highway. Victim has filed complaint.',
            category: 'CRIME',
            latitude: 19.0550,
            longitude: 72.8400,
            address: 'Bandra Metro Station Exit 2',
            city: 'Mumbai',
            state: 'Maharashtra',
            status: 'SUBMITTED',
            publisherId: reporter.id,
            publisherBadge: 'VERIFIED_REPORTER',
        },
    ];

    for (const incident of incidents) {
        await prisma.incident.create({
            data: incident,
        });
    }
    console.log('✅ Sample incidents created:', incidents.length);

    // ============================================
    // COMPLETION SUMMARY
    // ============================================

    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📋 Test Credentials:');
    console.log('');
    console.log('   ADMIN ACCOUNTS (Email + Password):');
    console.log('   ─────────────────────────────────');
    console.log('   Super Admin:   admin@spotsamachar.com / Admin@123');
    console.log('   Moderator 1:   moderator1@spotsamachar.com / Mod@123');
    console.log('   Moderator 2:   moderator2@spotsamachar.com / Mod@456');
    console.log('');
    console.log('   POLICE ACCOUNTS (Email + Password):');
    console.log('   ────────────────────────────────────');
    console.log('   Andheri PS:    inspector.andheri@mahapolice.gov.in / Police@123');
    console.log('   Bandra PS:     inspector.bandra@mahapolice.gov.in / Police@123');
    console.log('   Mumbai HQ:     dcp.mumbai@mahapolice.gov.in / Police@123');
    console.log('');
    console.log('   CITIZEN ACCOUNTS (Phone + Password):');
    console.log('   ─────────────────────────────────────');
    console.log('   Citizen:       9876543210 / citizen123');
    console.log('   Reporter:      9123456789 / reporter123');
    console.log('');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
